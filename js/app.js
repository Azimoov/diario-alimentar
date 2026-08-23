// app.js — controla a interface: registro do dia, dashboard, histórico,
// perfil/meta e dados (export/import + alimentos do usuário).

window.App = (function () {
  let S;            // estado (Store)
  let currentDate;  // 'YYYY-MM-DD' visível na aba Hoje
  // O cartão de peso vive na aba Métricas, que não tem navegação de data — por
  // isso ele carrega a sua própria, independente do dia aberto no Diário.
  let pesoDate;     // 'YYYY-MM-DD' do cartão de peso/composição

  // ---------- utilidades ----------
  function isoLocal(d) {
    const t = new Date(d);
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    return t.toISOString().slice(0, 10);
  }
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return isoLocal(d);
  }
  function fmtBR(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  function round(n, k) { const p = Math.pow(10, k || 0); return Math.round((n || 0) * p) / p; }
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => {
      if (c == null || c === false) return; // ignora filhos condicionais vazios
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function $(sel) { return document.querySelector(sel); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- refeições ----
  const MEALS = [
    { id: 'cafe', nome: '☕ Café da manhã' },
    { id: 'almoco', nome: '🍽️ Almoço' },
    { id: 'lanche', nome: '🥪 Lanche' },
    { id: 'jantar', nome: '🌙 Jantar' },
  ];
  const MEAL_NOMES = MEALS.reduce((a, m) => (a[m.id] = m.nome, a), { outros: '📋 Outros' });
  // palpite pelo horário — o usuário pode trocar a qualquer momento
  function mealPorHora(d) {
    const hh = (d || new Date()).getHours();
    if (hh >= 4 && hh < 11) return 'cafe';
    if (hh >= 11 && hh < 15) return 'almoco';
    if (hh >= 15 && hh < 19) return 'lanche';
    return 'jantar';
  }

  // Aviso discreto no rodapé (sem travar a tela como o alert). Some sozinho;
  // toque fecha antes. Usado no fluxo de foto, que é frequente.
  let toastTimer = null;
  function toast(msg, tipo) {
    let box = $('#toast');
    if (!box) {
      box = h('div', { id: 'toast', class: 'toast', onclick: () => box.classList.remove('show') });
      document.body.appendChild(box);
    }
    box.className = 'toast show' + (tipo ? ' toast-' + tipo : '');
    box.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), tipo === 'error' ? 7000 : 4500);
  }

  // etiqueta da fonte de um alimento (TACO/TBCA/USDA/meu/receita)
  function srcLabel(f) {
    if (!f) return '';
    if (f.custom) return f.recipe ? 'receita' : 'meu';
    return { taco: 'TACO', tbca: 'TBCA', usda: 'USDA', comum: 'comum' }[f.src] || '';
  }

  // guarda cru × cozido: pesar a comida PRONTA e registrar a versão CRUA é o
  // maior erro silencioso possível (até 3x nas kcal de arroz/massa/carne).
  // Só dispara nas classes que normalmente vão ao fogo — fruta/salada cruas
  // são o jeito normal de comer e não merecem alarme.
  const RAW_TOKENS = ['cru', 'crua', 'crus', 'cruas'];
  const RAW_GUARD_RE = /(arroz|macarr|massa|espaguete|lasanha|nhoque|feijao|feijoes|lentilha|ervilha|grao|soja|aveia|quinoa|milho|farinha|carne|bovin|frango|galinha|peru|suin|porco|patinho|acem|alcatra|maminha|picanha|costela|lombo|file|bife|peixe|pescad|salmao|atum|tilapia|merluza|bacalhau|sardinha|camarao|lula|polvo|ovo|ovos|batata|mandioca|aipim|macaxeira|inhame|care|mandioquinha)/;
  function isRawFood(f) {
    return !!(f && f.norm
      && f.norm.split(' ').some(t => RAW_TOKENS.includes(t))
      && RAW_GUARD_RE.test(f.norm));
  }
  function cookedSiblings(f) {
    const toks = f.norm.split(' ').filter(t => !RAW_TOKENS.includes(t));
    const lead = toks.slice(0, Math.min(2, toks.length));
    if (!lead.length) return [];
    const COOKED = /(cozid|grelhad|assad|frit|refogad)/;
    return window.Parser.getFoods()
      .filter(o => String(o.id) !== String(f.id) && COOKED.test(o.norm) && lead.every(t => o.norm.includes(t)))
      .slice(0, 6);
  }

  // ---------- init ----------
  // O <body> já nasce com a classe "gate-active" (marcada direto no HTML,
  // antes de qualquer JS rodar) — então nada do app aparece até aqui embaixo
  // confirmar login. Sem conta/sessão válida, a única coisa visível é o
  // portão de entrar/criar conta.
  function init() {
    S = window.Store.load();
    window.Parser.setFoods(window.Store.combinedFoods());
    currentDate = isoLocal(new Date());
    pesoDate = currentDate;
    // Se o app JÁ ESTÁ ABERTO e a pessoa toca no link do e-mail, o navegador
    // só troca o #hash — não recarrega nada. Sem isto, o link "não faz nada".
    window.addEventListener('hashchange', tratarLinkDeRecuperacao);
    iniciarConta();
  }

  // Conta: link de recuperação tem prioridade (a pessoa chegou aqui pelo
  // e-mail justamente porque está trancada fora). Depois valida a sessão
  // guardada; sem sessão válida, mostra o portão em vez do app.
  let modalRecuperacao = null;
  function tratarLinkDeRecuperacao() {
    const token = window.Auth.tokenDeRecuperacao();
    if (!token || modalRecuperacao) return false;
    modalRecuperacao = abrirRedefinicao(token);
    return true;
  }

  async function iniciarConta() {
    // 1) decide a tela de BASE: o app (com sessão) ou o portão (sem sessão)
    let sincronizar = false;
    if (window.Auth.logado()) {
      const ok = await window.Auth.validarSessao();
      // erro de REDE não desloga ninguém (ver Auth.validarSessao) — nesse
      // caso `logado()` continua true e deixamos entrar com os dados locais,
      // só avisando. Só bloqueia de novo se a sessão foi mesmo invalidada.
      if (!ok && !window.Auth.logado()) {
        mostrarPortao();
      } else {
        liberarApp();
        if (ok) sincronizar = true;   // compara datas e decide/pergunta
        else toast('Sem conexão com o servidor — mostrando os dados salvos neste aparelho.', 'error');
      }
    } else {
      mostrarPortao();
    }

    // 2) só então o link do e-mail abre POR CIMA dessa base. Sempre tem que
    // sobrar uma tela utilizável atrás do modal: se ele for fechado, ou se o
    // link estiver expirado, a pessoa (que já está trancada fora) precisa
    // conseguir entrar ou pedir outro link — e não ficar num "Carregando…".
    tratarLinkDeRecuperacao();

    if (sincronizar) await sincronizarAoEntrar(null);
  }

  // ---- portão: nada do app monta enquanto não há sessão válida ----
  let appMontado = false;
  function liberarApp() {
    document.body.classList.remove('gate-active');
    if (!appMontado) { appMontado = true; bindTabs(); }
    renderAll();
    atualizarStatusConta();
    syncSharedFoods(); // base comum: atualiza em segundo plano (cache p/ offline)
    // "o que mudou" só depois do portão liberar: por cima da tela de login
    // seria um popup antes mesmo de a pessoa entrar. Uma vez por versão.
    checarNovidades();
  }

  function mostrarPortao() {
    document.body.classList.add('gate-active');
    renderGate();
  }

  // Tela de entrar / criar conta / esqueci a senha dentro do portão (não é
  // modal: não tem "x" nem fecha clicando fora — só sai daqui autenticando).
  function renderGate() {
    const gate = $('#gate');
    clear(gate);
    let aba = 'entrar';
    const card = h('div', { class: 'gate-card' });
    gate.appendChild(card);

    function campo(label, attrs) {
      const inp = h('input', Object.assign({ class: 'in' }, attrs));
      return { wrap: h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), inp]), inp };
    }

    function render() {
      clear(card);
      card.appendChild(h('div', { class: 'gate-brand' }, [
        h('img', { src: 'icons/icon.svg', alt: '', width: 32, height: 32 }), 'Highlander',
      ]));
      const tabs = h('div', { class: 'auth-tabs' }, [
        h('button', { class: aba === 'entrar' ? 'active' : '', onclick: () => { aba = 'entrar'; render(); } }, 'Entrar'),
        h('button', { class: aba === 'criar' ? 'active' : '', onclick: () => { aba = 'criar'; render(); } }, 'Criar conta'),
        h('button', { class: aba === 'esqueci' ? 'active' : '', onclick: () => { aba = 'esqueci'; render(); } }, 'Esqueci'),
      ]);
      card.appendChild(tabs);
      const msg = h('p', { class: 'auth-msg' });
      const emailF = campo('E-mail', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com', value: window.Auth.email() || '' });

      function comBotao(texto, acao) {
        const btn = h('button', { class: 'btn primary' }, texto);
        btn.addEventListener('click', async () => {
          msg.className = 'auth-msg';
          msg.textContent = '⏳ um instante…';
          card.classList.add('auth-busy');
          try {
            await acao();
          } catch (e) {
            msg.className = 'auth-msg erro';
            msg.textContent = '⚠ ' + e.message;
          }
          card.classList.remove('auth-busy');
        });
        return h('div', {}, [h('div', { class: 'btn-row' }, [btn]), msg]);
      }

      if (aba === 'entrar') {
        const senhaF = campo('Senha', { type: 'password', autocomplete: 'current-password', placeholder: 'sua senha' });
        card.appendChild(h('p', { class: 'note' }, 'Entre para acessar seu diário, exames e métricas.'));
        card.appendChild(emailF.wrap);
        card.appendChild(senhaF.wrap);
        card.appendChild(comBotao('Entrar', async () => {
          await window.Auth.entrar(emailF.inp.value.trim(), senhaF.inp.value);
          liberarApp();
          const info = h('p');
          await sincronizarAoEntrar(info);
          if (info.textContent) toast(info.textContent, 'error');
        }));
        // Atalho explícito: quem esqueceu a senha procura aqui embaixo do
        // formulário, não numa aba com rótulo curto lá em cima.
        card.appendChild(h('button', {
          class: 'link-btn gate-esqueci',
          onclick: () => { aba = 'esqueci'; render(); },
        }, 'Esqueci minha senha'));
      } else if (aba === 'criar') {
        const senhaF = campo('Senha (mínimo 8 caracteres)', { type: 'password', autocomplete: 'new-password', placeholder: 'escolha uma senha' });
        const senha2F = campo('Repita a senha', { type: 'password', autocomplete: 'new-password' });
        const convF = campo('Código de convite', { type: 'text', placeholder: 'o código que o dono do app te passou' });
        card.appendChild(h('p', { class: 'note' }, 'A conta guarda seu histórico na nuvem e permite recuperar a senha por e-mail. Use um e-mail que você realmente acessa — é por ele que a recuperação funciona.'));
        card.appendChild(emailF.wrap);
        card.appendChild(senhaF.wrap);
        card.appendChild(senha2F.wrap);
        card.appendChild(convF.wrap);
        card.appendChild(comBotao('Criar conta', async () => {
          const senha = senhaF.inp.value;
          if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
          if (senha !== senha2F.inp.value) throw new Error('As duas senhas não são iguais.');
          await window.Auth.criarConta(emailF.inp.value.trim(), senha, convF.inp.value.trim());
          liberarApp();
          const info = h('p');
          await sincronizarAoEntrar(info);
          toast('Conta criada ✅ Seus dados agora ficam na nuvem.', 'ok');
        }));
        card.appendChild(h('p', { class: 'hint' }, 'Honestidade: neste modelo, quem administra o servidor consegue ler os dados guardados — é o preço de poder recuperar a senha.'));
      } else {
        card.appendChild(h('p', { class: 'note' }, 'Informe o e-mail da sua conta. Enviamos um link que vale 30 minutos e abre a tela de nova senha aqui mesmo — seus dados continuam guardados.'));
        card.appendChild(emailF.wrap);
        card.appendChild(comBotao('Enviar link de recuperação', async () => {
          await window.Auth.esqueciSenha(emailF.inp.value.trim());
          msg.className = 'auth-msg ok';
          msg.textContent = '✅ Se existe conta com esse e-mail, o link já foi enviado. Confira a caixa de entrada (e o spam).';
        }));
        card.appendChild(h('button', {
          class: 'link-btn gate-esqueci',
          onclick: () => { aba = 'entrar'; render(); },
        }, '← Voltar para entrar'));
      }
    }
    render();
  }

  function refreshFoods() { window.Parser.setFoods(window.Store.combinedFoods()); }

  function renderAll() {
    renderHoje();
    renderHist();
    renderAlimentos();
    renderPerfil();
    renderDados();
    renderExLab();
    renderExImg();
    renderMeds();
    renderSaude();
    renderTreino();
    renderConversa();
    renderAnalises();
    updateNavBadges();
  }

  // ---- navegação em dois níveis: área (Diário · Exames · Métricas · Remédios · Treino · IA) + abas ----
  let currentApp = 'diario';
  const APP_TAB = { diario: 'hoje', exames: 'exlab', saude: 'saude', remedios: 'remedios', treino: 'trsemana', ia: 'conversa' }; // aba lembrada por área
  function bindTabs() {
    document.querySelectorAll('.app-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentApp = btn.dataset.app; applyNav(); });
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const app = btn.closest('nav.tabs').dataset.app;
        currentApp = app;
        APP_TAB[app] = btn.dataset.tab;
        applyNav();
      });
    });
    applyNav();
  }
  function applyNav() {
    const tab = APP_TAB[currentApp];
    document.querySelectorAll('.app-btn').forEach(b => b.classList.toggle('active', b.dataset.app === currentApp));
    document.querySelectorAll('nav.tabs').forEach(n => { n.hidden = n.dataset.app !== currentApp; });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  }
  function goTo(app, tab) { currentApp = app; if (tab) APP_TAB[app] = tab; applyNav(); }
  // bolinha no botão Exames quando há lembrete vencido
  function updateNavBadges() {
    const n = (S.examReminders || []).filter(r => reminderDue(r).days <= 0).length;
    const dot = document.querySelector('.app-btn[data-app="exames"] .dot');
    if (dot) dot.hidden = !n;
  }

  // ---- novidades da versão ----
  // A lista mora em js/changelog.js. A versão do topo é a versão do app; o
  // que a pessoa já viu fica em settings.versaoVista.
  function versoes() { return Array.isArray(window.CHANGELOG) ? window.CHANGELOG : []; }
  function versaoAtual() { return (versoes()[0] || {}).versao || null; }

  // Quem acabou de criar a conta não "perdeu" atualização nenhuma: mostrar
  // "o que mudou" para quem nunca usou a versão anterior é ruído. Por isso
  // conta-se como estreante quem ainda não tem dado nenhum — nesse caso a
  // versão é marcada como vista em silêncio.
  function contaTemDados() {
    // dia com ITENS, não dia existente: a própria aba Hoje cria um dia vazio
    // ao abrir, e contá-lo faria toda conta nova parecer conta antiga.
    const comeu = Object.keys(S.days || {}).some(d => ((S.days[d] || {}).items || []).length);
    return !!(comeu || Object.keys(S.weights || {}).length
      || (S.labExams || []).length || (S.meds || []).length
      || (S.treino && S.treino.plano));
  }

  function checarNovidades() {
    const atual = versaoAtual();
    if (!atual) return;
    if (S.settings.versaoVista === atual) return;      // já viu esta
    const estreante = !S.settings.versaoVista && !contaTemDados();
    S.settings.versaoVista = atual;
    window.Store.save();
    if (estreante) return;                             // conta nova: sem popup
    abrirNovidades(true);
  }

  function abrirNovidades(sóAUltima) {
    const lista = sóAUltima ? versoes().slice(0, 1) : versoes();
    if (!lista.length) return;
    const corpo = h('div', {}, lista.map(v => h('div', { class: 'versao-bloco' }, [
      h('div', { class: 'versao-head' }, [
        h('strong', {}, v.titulo),
        h('span', { class: 'versao-tag' }, 'versão ' + v.versao),
      ]),
      h('p', { class: 'hint' }, fmtBR(v.data)),
      h('ul', { class: 'versao-lista' }, (v.mudancas || []).map(m => h('li', {}, m))),
    ])));
    if (sóAUltima) {
      corpo.appendChild(h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'link-btn',
          onclick: () => { mod.close(); goTo('diario', 'dados'); renderAll(); },
        }, 'ver todas as versões'),
      ]));
    }
    const mod = modal(sóAUltima ? '✨ O que mudou nesta atualização' : '📋 Novidades por versão', corpo);
    return mod;
  }

  function renderNovidadesCard() {
    const atual = versaoAtual();
    const ultima = versoes()[0];
    return h('div', { class: 'card' }, [
      h('h3', {}, '✨ Novidades'),
      h('p', { class: 'note' }, ultima
        ? 'Você está na versão ' + atual + ' — ' + ultima.titulo + ' (' + fmtBR(ultima.data) + ').'
        : 'Sem histórico de versões.'),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn', onclick: () => abrirNovidades(false) }, '📋 Ver o que mudou em cada versão'),
      ]),
    ]);
  }

  // ---- platô de peso: o app tem que AVISAR, não esperar ser procurado ----
  // O TDEE real observado já era calculado, mas ficava parado num cartão da
  // aba Perfil esperando a pessoa ir lá e marcar uma caixinha. Quem registra
  // todo dia e vê o peso empacado não recebia aviso nenhum — o dado existia e
  // não virava ação. Isto aqui é a ponte.
  //
  // Devolve null quando não há o que dizer (dados insuficientes, meta na mão,
  // não quer emagrecer, ou o peso está andando).
  // Há quantas semanas a pessoa está em déficit sem parar. Aproximação
  // honesta: conta as semanas, a partir de hoje para trás, em que houve
  // registro e o peso da semana ficou igual ou menor que o da anterior.
  // Serve só para separar "faz três semanas" de "faz seis meses" — não é
  // medida fina, e a interpretação disso vive na base (seção de platô).
  function semanasEmDeficit() {
    const datas = Object.keys(S.weights || {}).filter(d => S.weights[d] > 0).sort();
    if (datas.length < 4) return 0;
    const prim = datas[0];
    const dias = Math.round((Date.parse(datas[datas.length - 1] + 'T12:00:00') - Date.parse(prim + 'T12:00:00')) / 86400000);
    if (dias < 21) return 0;                       // pouco tempo p/ falar em dieta longa
    // só conta como "em dieta" se o peso de fato caiu no período
    const caiu = S.weights[datas[0]] - S.weights[datas[datas.length - 1]];
    if (caiu <= 0.5) return 0;
    return Math.floor(dias / 7);
  }

  function analisarPlato() {
    const eg = effectiveGoal();
    const ad = eg.adaptive;
    if (!ad.ok || ad.suspeito) return null;         // sem base p/ afirmar nada
    const g = S.goal;
    if (g.manualKcal != null && g.manualKcal !== '') return null;  // meta na mão é escolha dela
    const N = window.Nutrition;
    const deficitAlvo = g.deficit != null ? Number(g.deficit) : N.deficitFromPace(g.pace);
    if (!(deficitAlvo > 0)) return null;            // não está tentando emagrecer
    const alvoKgSem = deficitAlvo * 7 / N.KCAL_PER_KG;
    const perdendoKgSem = -ad.slopeKgWeek;          // slope negativo = perdendo
    // "andando" = pelo menos metade do ritmo pretendido. Abaixo disso é platô.
    if (perdendoKgSem >= alvoKgSem * 0.5) return null;

    const base = { ad, eg, alvoKgSem, perdendoKgSem, ganhando: ad.slopeKgWeek > 0.05 };
    // Duas explicações possíveis, e elas pedem conselhos OPOSTOS — dizer
    // "coma menos" para quem já está estourando a própria meta seria trocar o
    // problema de lugar.
    if (ad.meanIntake > eg.goalK + 100) {
      return Object.assign(base, {
        causa: 'aderencia',
        excedente: Math.round(ad.meanIntake - eg.goalK),
      });
    }
    // Meta cumprida e peso parado → o gasto real é menor do que a meta supõe.
    // A meta honesta sai do gasto MEDIDO, não da fórmula.
    const sugerida = Math.max(
      Math.round(ad.tdee - deficitAlvo),
      Math.round(N.bmr(S.profile) || 0),            // nunca abaixo do basal
      N.floorKcal(S.profile.sex),                   // nem do piso de segurança
    );
    const puro = Math.round(ad.tdee - deficitAlvo);   // o que a conta pediria
    return Object.assign(base, {
      causa: 'meta_alta',
      semanasDeDieta: semanasEmDeficit(),
      sugerida,
      corte: eg.goalK - sugerida,
      noPiso: sugerida > puro,
      // o pedaço do déficit que NÃO cabe no prato: tem que vir de gasto
      faltaPorTreino: Math.max(0, sugerida - puro),
    });
  }

  // "depois eu vejo": some por 14 dias. Sem isso o aviso vira paisagem — e um
  // aviso que a pessoa aprendeu a ignorar não avisa mais nada.
  function platoAdiado() {
    const ate = S.settings.platoAdiadoAte;
    return !!(ate && isoLocal(new Date()) < ate);
  }

  function renderPlatoCard(p) {
    const ad = p.ad;
    const kg = (v) => (Math.round(Math.abs(v) * 100) / 100).toString().replace('.', ',');
    const box = h('div', { class: 'card plato-card' }, [
      h('h3', {}, p.ganhando ? '⚖️ Seu peso está subindo' : '⚖️ Seu peso está parado'),
    ]);

    box.appendChild(h('p', { class: 'note' },
      'Nos últimos ' + ad.windowDays + ' dias seu peso ' + (p.ganhando
        ? 'subiu ' + kg(ad.slopeKgWeek) + ' kg por semana'
        : (Math.abs(ad.slopeKgWeek) < 0.02 ? 'praticamente não mudou' : 'caiu só ' + kg(ad.slopeKgWeek) + ' kg por semana'))
      + ', e a sua meta é perder ' + kg(p.alvoKgSem) + ' kg por semana. '
      + 'Base: ' + ad.daysUsed + ' dias de registro e ' + ad.weighIns + ' pesagens.'));

    if (p.causa === 'aderencia') {
      // Não adianta baixar a meta de quem já não está cumprindo a atual.
      box.appendChild(h('p', { class: 'note' },
        'A explicação aqui não é a meta: você registrou em média ' + ad.meanIntake
        + ' kcal por dia, ' + p.excedente + ' kcal acima da sua própria meta de '
        + p.eg.goalK + ' kcal. Antes de cortar mais, vale mirar a meta que já existe — '
        + 'ou, se ela for irreal para a sua rotina, subir a meta e aceitar um ritmo mais lento.'));
      box.appendChild(h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn', onclick: () => goTo('diario', 'perfil') }, '⚙️ Rever minha meta'),
        h('button', { class: 'link-btn', onclick: adiarPlato }, 'depois eu vejo'),
      ]));
      return box;
    }

    // causa === 'meta_alta'
    box.appendChild(h('p', { class: 'note' },
      'Você está cumprindo a meta (média de ' + ad.meanIntake + ' kcal contra os '
      + p.eg.goalK + ' kcal previstos) e mesmo assim o peso não anda. Isso quer dizer que '
      + 'seu gasto real é menor do que a fórmula supunha: medido pelos seus próprios '
      + 'registros, ele é de ' + ad.tdee + ' kcal por dia. Para voltar a perder '
      + kg(p.alvoKgSem) + ' kg por semana, a meta precisa ser ' + p.sugerida + ' kcal — '
      + (p.corte > 0 ? p.corte + ' kcal a menos do que hoje.' : 'o que já é o mínimo seguro.')));
    if (p.noPiso) {
      // Chegou no piso: daqui pra baixo não se corta comida. O que falta do
      // déficit passa a ser trabalho do coach — mais cardio, não menos prato.
      box.appendChild(h('p', { class: 'note' },
        '🏋️ Daqui pra baixo não dá para cortar comida: a conta pediria menos que o seu gasto basal. '
        + 'O que falta do déficit — cerca de ' + p.faltaPorTreino + ' kcal por dia — sai do outro lado, '
        + 'gastando mais. O coach de treino já recebe esse número e aumenta o cardio de Zona 2, '
        + 'que é o que soma gasto sem estourar a recuperação.'));
      box.appendChild(h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary',
          onclick: () => {
            S.settings.platoAdiadoAte = shiftDate(isoLocal(new Date()), 14);
            window.Store.save();
            goTo('treino', 'trsemana');
            renderAll();
            toast('O coach vai usar esse número na próxima semana que montar.', 'ok');
          },
        }, '🏋️ Ir para o treino'),
      ]));
    }
    box.appendChild(h('p', { class: 'hint' },
      'A outra leitura possível: se sobraram refeições sem registrar, o número real ingerido é maior '
      + 'que o registrado. O gasto medido acima já absorve esse viés — desde que ele seja constante.'));
    // Dieta longa: cortar mais NÃO é a única saída, e talvez nem a melhor. O
    // gasto cai em resposta ao déficit prolongado (adaptação metabólica), e
    // uma pausa em manutenção é a resposta com melhor base — ver a seção de
    // platô em conhecimento.js.
    if (p.semanasDeDieta >= 12) {
      box.appendChild(h('p', { class: 'note' },
        '⏸️ Você está em déficit há cerca de ' + p.semanasDeDieta + ' semanas. Depois de tanto tempo, '
        + 'parte da queda do gasto é resposta do corpo ao próprio déficit — e cortar ainda mais tende a '
        + 'render cada vez menos. Uma alternativa com boa base é uma PAUSA de 1 a 2 semanas comendo na '
        + 'MANUTENÇÃO (nem déficit, nem exagero) e só depois retomar. Não é desistir: no estudo que testou '
        + 'isso, quem alternou déficit e manutenção perdeu MAIS gordura no fim, e não menos. '
        + 'Pergunte à IA sobre "pausa da dieta" se quiser entender antes de decidir.'));
      box.appendChild(h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn',
          onclick: () => {
            S.settings.platoAdiadoAte = shiftDate(isoLocal(new Date()), 14);
            window.Store.save();
            scheduleBackup();
            renderAll();
            toast('Combinado — volto a falar disso em 2 semanas.', 'ok');
          },
        }, '⏸️ Vou fazer uma pausa de 2 semanas'),
      ]));
    }
    box.appendChild(h('div', { class: 'btn-row' }, [
      h('button', {
        class: 'btn primary',
        onclick: () => {
          S.goal.useAdaptive = true;
          // A média dos últimos 28 dias ainda é a de ANTES da meta nova. Sem
          // esta pausa o app diria, no segundo seguinte, "você está comendo
          // acima da meta" — cobrando adesão a uma meta que começou agora.
          S.settings.platoAdiadoAte = shiftDate(isoLocal(new Date()), 14);
          window.Store.save();
          scheduleBackup();
          toast('Meta ajustada pelo seu gasto real ✅', 'ok');
          renderAll();
        },
      }, '✅ Usar ' + p.sugerida + ' kcal'),
      h('button', { class: 'btn', onclick: () => goTo('diario', 'perfil') }, '⚙️ Ver a conta'),
      h('button', { class: 'link-btn', onclick: adiarPlato }, 'depois eu vejo'),
    ]));
    return box;
  }

  function adiarPlato() {
    S.settings.platoAdiadoAte = shiftDate(isoLocal(new Date()), 14);
    window.Store.save();
    renderHoje();
  }

  // ================= ABA HOJE =================
  function currentDay() {
    if (!S.days[currentDate]) S.days[currentDate] = { items: [] };
    return S.days[currentDate];
  }

  function addEntries() {
    const ta = $('#entry');
    const parsed = window.Parser.parseText(ta.value);
    if (!parsed.length) return;
    const day = currentDay();
    const mealSel = $('#meal-sel');
    const meal = (mealSel && mealSel.value) || mealPorHora();
    // entradas novas no TOPO da lista (batch inteiro, mantendo a ordem interna)
    const novos = parsed.map(p => ({
      raw: p.raw,
      foodText: p.foodText,
      foodId: p.foodId,
      grams: p.grams,
      conf: p.confidence,
      match: p.matchStatus,   // 'matched' | 'ambiguous' | 'not_found'
      note: primaryFlag(p),
      meal,
    }));
    day.items.unshift(...novos);
    window.Store.save();
    ta.value = '';
    renderHoje();
    renderHist();
  }

  function primaryFlag(p) {
    const warn = p.flags.find(f => f.level === 'warn');
    const info = p.flags.find(f => f.level === 'info');
    return (warn || info || {}).msg || '';
  }

  // ============ BASE COMUM DE ALIMENTOS ============
  // Alimentos cadastrados com "compartilhar" ligam todos os usuários do
  // grupo: ficam no proxy e sincronizam a cada abertura do app (com cache
  // local p/ funcionar offline).
  async function syncSharedFoods() {
    if (!window.Auth.podeUsarProxy()) return;
    try {
      const res = await fetch(window.Auth.urlProxy('/foods'), {
        headers: window.Auth.cabecalhosProxy(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.foods)) {
        window.Store.setSharedFoods(data.foods);
        refreshFoods();
      }
    } catch (e) { /* offline — usa o cache local */ }
  }
  async function shareFood(food) {
    const res = await fetch(window.Auth.urlProxy('/foods'), {
      method: 'POST',
      headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name: food.name,
        kcal: Number(food.kcal), prot: Number(food.prot) || undefined,
        carb: Number(food.carb) || undefined, fat: Number(food.fat) || undefined,
        fiber: Number(food.fiber) || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, detail: (data && data.detail) || ('HTTP ' + res.status) };
    syncSharedFoods();
    return { ok: true };
  }

  // ============ BACKUP AUTOMÁTICO NA NUVEM ============
  // O diário inteiro é CIFRADO NO APARELHO (AES-GCM; chave derivada da senha
  // do app via PBKDF2) e guardado no proxy. O servidor só vê um blob opaco.
  // Cada senha tem seu cofre — em multiusuário ninguém alcança o dos outros.
  const _te = new TextEncoder(), _td = new TextDecoder();
  function bufToB64(buf) {
    const u = new Uint8Array(buf); let s = ''; const CH = 0x8000;
    for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function b64ToBuf(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  async function deriveKey(senha, salt) {
    const base = await crypto.subtle.importKey('raw', _te.encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptState(text, senha) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(senha, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _te.encode(text));
    return { v: 1, blob: bufToB64(ct), iv: bufToB64(iv), salt: bufToB64(salt) };
  }
  async function decryptState(rec, senha) {
    const key = await deriveKey(senha, b64ToBuf(rec.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(rec.iv) }, key, b64ToBuf(rec.blob));
    return _td.decode(pt);
  }

  // Gancho único de "os dados mudaram": chamado depois de toda mutação.
  // Cuida da conta (envio automático p/ a nuvem) e, se estiver ligado, do
  // backup cifrado legado por senha do app.
  let backupTimer = null;
  function scheduleBackup() {
    if (window.Auth) {
      window.Auth.agendarEnvio();
      atualizarStatusConta();
    }
    if (!S.settings || !S.settings.autoBackup || !S.settings.proxyUrl || !S.settings.proxyToken) return;
    if (!(window.crypto && crypto.subtle)) return; // exige contexto seguro (https)
    clearTimeout(backupTimer);
    backupTimer = setTimeout(pushBackup, 4000);
  }
  async function pushBackup() {
    try {
      const payload = await encryptState(window.Store.exportJSON(), S.settings.proxyToken);
      payload.updatedAt = new Date().toISOString();
      const res = await fetch(S.settings.proxyUrl.replace(/\/+$/, '') + '/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Token': S.settings.proxyToken },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        S.settings.lastBackupAt = payload.updatedAt;
        window.Store.save();
        const el = document.getElementById('bk-status');
        if (el) el.textContent = 'Último backup: ' + new Date(payload.updatedAt).toLocaleString('pt-BR');
      }
      return res.ok;
    } catch (e) { return false; /* silencioso: backup não pode travar o app */ }
  }
  async function restoreBackup() {
    if (!S.settings.proxyUrl || !S.settings.proxyToken) {
      alert('Antes, configure o endereço do proxy e a senha do app (nesta aba, seção Registro por foto).');
      return false;
    }
    try {
      const res = await fetch(S.settings.proxyUrl.replace(/\/+$/, '') + '/backup', {
        headers: { 'X-App-Token': S.settings.proxyToken },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { alert((data && data.detail) || 'Nenhum backup encontrado para esta senha.'); return false; }
      let text = null;
      try { text = await decryptState(data, S.settings.proxyToken); } catch (e) { /* senha diferente */ }
      if (!text) { alert('Encontrei um backup, mas ele foi criptografado com OUTRA senha — não consigo abrir com a atual.'); return false; }
      const quando = data.updatedAt ? new Date(data.updatedAt).toLocaleString('pt-BR') : '?';
      if (!confirm('Restaurar o backup de ' + quando + '?\n\nIsto SUBSTITUI os dados atuais deste aparelho.')) return false;
      window.Store.importJSON(text, 'replace');
      S = window.Store.get();
      refreshFoods();
      renderAll();
      toast('Backup restaurado com sucesso ✅', 'ok');
      return true;
    } catch (e) { alert('Erro ao restaurar: ' + e.message); return false; }
  }

  // ============ FASE 2: registro por foto ============
  // A foto NÃO calcula nutrição: só sugere alimento + gramas. Cada item entra
  // como estimativa (amarela, editável) e é casado com a base TACO/custom.
  // A análise acontece no SEU proxy (aba Dados) — a chave da API nunca fica aqui.

  // Redimensiona p/ máx `max` px e converte p/ JPEG (menos dados, mais
  // rápido). Rótulos usam 1600 px — letra miúda precisa de resolução.
  function compressPhoto(file, max, qualidade) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = max || 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', qualidade || 0.8);
        resolve(dataUrl.split(',')[1]); // só o base64, sem o prefixo data:
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler a imagem.')); };
      img.src = url;
    });
  }

  async function analyzePhoto(base64, mode, mediaType) {
    // manda a lista de produtos com rótulo cadastrado: se a foto for a
    // embalagem de um deles, o modelo devolve o nome e o app reaproveita
    // o alimento já cadastrado (com os valores conferidos por você)
    const produtos = (S.customFoods || []).filter(f => f.labelPhoto).map(f => f.name);
    const res = await fetch(window.Auth.urlProxy(), {
      method: 'POST',
      headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        image: base64, mediaType: mediaType || 'image/jpeg',
        mode: mode || 'refeicao', produtos,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* resposta sem corpo */ }
    if (!res.ok) {
      const err = new Error((data && (data.detail || data.error)) || ('HTTP ' + res.status));
      err.semChave = res.status === 402;
      throw err;
    }
    return data || { itens: [], observacao: '' };
  }

  // lê um arquivo (PDF) como base64 puro, sem o prefixo data:
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const i = s.indexOf(',');
        i === -1 ? reject(new Error('Não consegui ler o arquivo.')) : resolve(s.slice(i + 1));
      };
      r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
      r.readAsDataURL(file);
    });
  }

  // ---- ler laudo por foto/PDF (usado nas duas abas de Exames) --------------
  // Nada é salvo direto: o resultado sempre passa por uma tela de conferência.
  // Transcrição automática de exame erra, e aqui o custo do erro é alto.
  async function lerLaudo(file, modo, botao) {
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const rotuloOriginal = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = ehPdf ? '⏳ lendo o PDF…' : '⏳ lendo o laudo…'; }
    try {
      // foto de laudo precisa de resolução (letra miúda e tabelas), como o rótulo
      const dados = ehPdf
        ? await analyzePhoto(await fileToBase64(file), modo, 'application/pdf')
        : await analyzePhoto(await compressPhoto(file, 1800, 0.85), modo, 'image/jpeg');
      return dados;
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotuloOriginal; }
    }
  }

  // par de botões (câmera + PDF) que alimenta um leitor de laudo
  function botoesLaudo(modo, aoLer) {
    const fotoIn = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) rodar(f, fotoBtn); },
    });
    const pdfIn = h('input', {
      type: 'file', accept: 'application/pdf,.pdf', style: 'display:none',
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) rodar(f, pdfBtn); },
    });
    const guarda = (abrir) => () => {
      if (!window.Auth.podeUsarProxy()) {
        toast('Para ler laudo, entre na sua conta e cadastre sua chave em Dados.', 'error');
        return;
      }
      abrir();
    };
    const fotoBtn = h('button', { class: 'btn', onclick: guarda(() => fotoIn.click()) }, '📷 Fotografar laudo');
    const pdfBtn = h('button', { class: 'btn', onclick: guarda(() => pdfIn.click()) }, '📄 Carregar PDF');

    async function rodar(file, botao) {
      try {
        aoLer(await lerLaudo(file, modo, botao));
      } catch (err) {
        toast('Não consegui ler o laudo: ' + err.message, 'error');
        if (err.semChave) goTo('diario', 'dados');
      }
    }
    return h('div', { class: 'btn-row' }, [fotoBtn, fotoIn, pdfBtn, pdfIn]);
  }

  // ---- foto de TABELA NUTRICIONAL (preenche o cadastro de alimento) ----
  // Converte p/ base 100 g quando o rótulo só traz a porção; valores ficam
  // editáveis e o usuário é instruído a conferir com a embalagem.
  function applyLabelToForm(r, container) {
    if (!r || r.base === 'desconhecida' || r.kcal == null) {
      return { ok: false, msg: 'Não consegui ler a tabela nutricional: ' + ((r && r.observacao) || 'foto ilegível ou sem tabela. Tente de novo com boa luz, de frente.') };
    }
    let fator = 1;
    let origem = 'valores por 100 g do rótulo';
    if (r.base === 'porcao') {
      if (!(r.porcao_g > 0)) {
        return { ok: false, msg: 'O rótulo só traz valores por porção e não consegui ler o tamanho da porção. Preencha manualmente.' };
      }
      fator = 100 / r.porcao_g;
      origem = 'convertido da porção de ' + r.porcao_g + ' g para 100 g';
    }
    const setVal = (key, v, dec) => {
      const inp = [...container.querySelectorAll('input')].find(i => i.dataset.key === key);
      if (inp && v != null) inp.value = Math.round(v * fator * Math.pow(10, dec)) / Math.pow(10, dec);
    };
    setVal('kcal', r.kcal, 0);
    setVal('prot', r.prot, 1);
    setVal('carb', r.carb, 1);
    setVal('fat', r.fat, 1);
    setVal('fiber', r.fiber, 1);
    const nomeInp = [...container.querySelectorAll('input')].find(i => i.dataset.key === 'name');
    if (nomeInp && !nomeInp.value.trim() && r.nome) nomeInp.value = r.nome;
    let msg = 'Preenchido a partir do rótulo (' + origem + '). CONFIRA os números com a embalagem antes de salvar.';
    if (r.observacao) msg += '\n\nObservação: ' + r.observacao;
    return { ok: true, msg };
  }

  // Insere os itens estimados no dia atual (exposta p/ testes).
  function addPhotoItems(itens, observacao) {
    const day = currentDay();
    const novos = [];
    let reconhecidos = 0;
    (itens || []).forEach(it => {
      if (!it || !it.nome || !(it.gramas > 0)) return;
      // rótulo reconhecido? usa o alimento que VOCÊ cadastrou (valores já
      // conferidos) em vez de casar por nome na base geral
      let cadastrado = null;
      if (it.produto) {
        cadastrado = (S.customFoods || []).find(f => f.labelPhoto && f.name === it.produto);
      }
      const match = cadastrado
        ? { foodId: cadastrado.id, status: 'matched' }
        : window.Parser.matchFood(it.nome);
      if (cadastrado) reconhecidos++;
      novos.push({
        raw: '[foto] ' + (cadastrado ? cadastrado.name : it.nome),
        foodText: cadastrado ? cadastrado.name : it.nome,
        foodId: match.foodId,
        grams: Math.round(it.gramas),
        conf: 'estimate',
        match: match.status,
        note: cadastrado
          ? 'Rótulo reconhecido: ' + cadastrado.name + ' — confira as gramas.'
          : 'Estimado por foto (confiança ' + (it.confianca || 'baixa') + ') — confira alimento e gramas.',
        meal: (($('#meal-sel') || {}).value) || mealPorHora(),
      });
    });
    const added = novos.length;
    day.items.unshift(...novos); // foto também entra no topo
    window.Store.save();
    renderHoje();
    renderHist();
    // Sem aviso quando dá certo: os itens já aparecem na lista (marcados como
    // estimativa). Só avisa se a foto não rendeu nada.
    if (!added) toast('Nenhum alimento identificado na foto.' + (observacao ? ' ' + observacao : ''), 'error');
    return added;
  }

  async function handlePhotoPick(file) {
    const btn = $('#photo-btn');
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ analisando…'; }
    try {
      const base64 = await compressPhoto(file);
      const data = await analyzePhoto(base64);
      addPhotoItems(data.itens, data.observacao);
    } catch (err) {
      toast('Não consegui analisar a foto: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  function itemNutrients(item) {
    const food = window.Parser.getFood(item.foodId);
    return window.Nutrition.itemNutrients(food, item.grams);
  }

  // ---- meta efetiva (fórmula ou TDEE adaptativo) --------------------------
  function dailyKcalMap() {
    const map = {};
    Object.keys(S.days).forEach(date => {
      const items = S.days[date].items || [];
      if (!items.length) return;
      const tot = window.Nutrition.sumNutrients(items.map(itemNutrients).filter(n => n.hasKcal));
      if (tot.kcal > 0) map[date] = Math.round(tot.kcal);
    });
    return map;
  }
  function computeAdaptive() {
    return window.Nutrition.adaptiveTDEE(dailyKcalMap(), S.weights);
  }
  // Meta que o app realmente usa: manual > (TDEE real, se ligado e disponível)
  // > fórmula Mifflin-St Jeor. Devolve também o diagnóstico adaptativo.
  function effectiveGoal() {
    const adaptive = computeAdaptive();
    const useAdapt = !!(S.goal.useAdaptive && adaptive.ok && !adaptive.suspeito);
    const goalK = window.Nutrition.goalKcal(S.profile, S.goal, useAdapt ? adaptive.tdee : null);
    return { adaptive, useAdapt, goalK, mt: window.Nutrition.macroTargets(S.profile, S.goal, goalK) };
  }

  function renderHoje() {
    const root = $('#tab-hoje');
    clear(root);
    const day = currentDay();

    // ----- navegação de data -----
    const isToday = currentDate === isoLocal(new Date());
    root.appendChild(h('div', { class: 'daynav' }, [
      h('button', { class: 'icon-btn', onclick: () => { currentDate = shiftDate(currentDate, -1); renderHoje(); } }, '‹'),
      h('input', {
        type: 'date', value: currentDate, class: 'date-input',
        onchange: e => { currentDate = e.target.value || currentDate; renderHoje(); },
      }),
      h('button', { class: 'icon-btn', disabled: isToday ? 'disabled' : null, onclick: () => { if (!isToday) { currentDate = shiftDate(currentDate, 1); renderHoje(); } } }, '›'),
      isToday ? null : h('button', { class: 'link-btn', onclick: () => { currentDate = isoLocal(new Date()); renderHoje(); } }, 'hoje'),
    ]));

    // ----- exame vencido? aviso discreto que leva à área Exames -----
    const vencidos = (S.examReminders || []).filter(r => reminderDue(r).days <= 0);
    if (vencidos.length) {
      root.appendChild(h('button', {
        class: 'due-banner',
        onclick: () => goTo('exames', vencidos[0].kind === 'img' ? 'eximg' : 'exlab'),
      }, '🔔 ' + (vencidos.length === 1
        ? 'Está na hora de repetir: ' + vencidos[0].name + ' — toque para ver'
        : vencidos.length + ' exames para repetir — toque para ver')));
    }

    // ----- peso empacado? o aviso vem até a pessoa -----
    const plato = analisarPlato();
    if (plato && !platoAdiado()) root.appendChild(renderPlatoCard(plato));

    // ----- entrada de texto -----
    // ----- boas-vindas no primeiro uso (multiusuário: cada aparelho é de
    // uma pessoa; some sozinho quando o perfil é preenchido) -----
    const p = S.profile;
    const perfilIncompleto = !(p.age > 0) || !(p.height > 0) || !(p.weight > 0);
    if (perfilIncompleto) {
      root.appendChild(h('div', { class: 'card welcome' }, [
        h('h3', {}, '👋 Bem-vindo(a) ao Highlander'),
        h('p', { class: 'note' }, 'Seus dados ficam guardados na sua conta — ninguém mais vê o que você registra. Para começar:'),
        h('ol', { class: 'welcome-steps' }, [
          h('li', {}, [h('strong', {}, '1. Preencha seu perfil'), ' (sexo, idade, altura, peso) para calcular sua meta diária de calorias.']),
          h('li', {}, [h('strong', {}, '2. Registre o que comer'), ' escrevendo, ex.: “100 g arroz, 1 ovo”.']),
          h('li', {}, [h('strong', {}, '3. Faça backup'), ' de vez em quando na aba Dados (Exportar).']),
        ]),
        h('button', {
          class: 'btn primary',
          onclick: () => document.querySelector('.tab-btn[data-tab="perfil"]').click(),
        }, 'Preencher meu perfil'),
      ]));
    }

    const photoInput = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) handlePhotoPick(f); },
    });
    const box = h('div', { class: 'card entry-card' }, [
      h('label', { class: 'lbl', for: 'entry' }, 'O que você comeu? (uma linha por alimento)'),
      h('textarea', { id: 'entry', rows: '3', placeholder: '100 g patinho\n120g arroz\n1 ovo\nmeia xicara de feijao' }),
      h('div', { class: 'entry-actions' }, [
        h('select', { id: 'meal-sel', class: 'meal-sel', title: 'Refeição' },
          MEALS.map(m => h('option', { value: m.id, selected: m.id === mealPorHora() ? 'selected' : null }, m.nome))),
        h('span', { class: 'hint' }, 'Ex.: “150 g frango”, “1 banana”'),
        photoInput,
        h('button', {
          class: 'btn', id: 'photo-btn', title: 'Registrar por foto (Fase 2)',
          onclick: () => {
            if (!window.Auth.podeUsarProxy()) {
              toast('Para usar foto, entre na sua conta (toque em “entrar”, no topo).', 'error');
              return;
            }
            photoInput.click();
          },
        }, '📷 Foto'),
        h('button', { class: 'btn primary', onclick: addEntries }, '+ Adicionar'),
      ]),
    ]);
    // ----- dashboard PRIMEIRO (fixado no topo da aba) -----
    root.appendChild(renderDashboard(day));
    root.appendChild(box);
    // Ctrl+Enter envia
    box.querySelector('#entry').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addEntries(); }
    });

    // ----- lista de itens, agrupada por refeição -----
    const list = h('div', { class: 'items' });
    if (!day.items.length) {
      list.appendChild(h('p', { class: 'empty' }, 'Nenhum item ainda. Escreva acima e toque em Adicionar.'));
    } else {
      // mantém a ordem de registro dentro de cada refeição; grupos vazios somem
      const ordem = MEALS.map(m => m.id).concat('outros');
      const porMeal = {};
      day.items.forEach((item, idx) => {
        const g = MEAL_NOMES[item.meal] ? item.meal : 'outros';
        (porMeal[g] = porMeal[g] || []).push({ item, idx });
      });
      // cada refeição é uma "janela" própria que abre/fecha; o app lembra
      // quais você deixou fechadas
      const fechadas = S.settings.mealsFechados || [];
      ordem.forEach(g => {
        const grupo = porMeal[g];
        if (!grupo || !grupo.length) return;
        const tot = window.Nutrition.sumNutrients(grupo.map(x => itemNutrients(x.item)).filter(n => n.hasKcal));
        const corpo = h('div', { class: 'meal-body' });
        grupo.forEach(x => corpo.appendChild(renderItem(x.item, x.idx)));
        const det = h('details', {
          class: 'meal-group',
          open: fechadas.indexOf(g) === -1 ? 'open' : null,
          ontoggle: e => {
            const lista = (S.settings.mealsFechados || []).filter(x => x !== g);
            if (!e.target.open) lista.push(g);
            S.settings.mealsFechados = lista;
            window.Store.save();
          },
        }, [
          h('summary', { class: 'meal-head' }, [
            h('span', { class: 'meal-chev' }, '›'),
            h('span', { class: 'meal-name' }, MEAL_NOMES[g]),
            h('span', { class: 'meal-meta' }, [
              h('span', {}, grupo.length + (grupo.length > 1 ? ' itens' : ' item')),
              h('span', { class: 'meal-total' }, round(tot.kcal, 0) + ' kcal'),
            ]),
          ]),
          corpo,
        ]);
        list.appendChild(det);
      });
    }
    root.appendChild(list);
  }

  function renderItem(item, idx) {
    const food = window.Parser.getFood(item.foodId);
    const n = itemNutrients(item);
    const resolved = food && item.grams > 0;
    const noKcal = food && food.kcal == null;
    const needsGrams = !(item.grams > 0);
    const ambiguous = item.match === 'ambiguous';
    const searchQuery = item.foodText || item.raw;
    const pickFood = id => { item.foodId = id; item.match = 'matched'; window.Store.save(); renderHoje(); renderHist(); };

    // guarda cru×cozido: só quando o alimento casado é CRU mas o usuário NÃO
    // digitou "cru" — ou seja, o casamento silencioso perigoso. Quem escreve
    // "arroz cru" sabe o que está fazendo. Ambíguo/não-achado já têm seletor.
    const typedRaw = window.Parser.normalize(item.foodText || item.raw || '')
      .split(' ').some(t => RAW_TOKENS.includes(t));
    const rawGuard = !!(food && !noKcal && !ambiguous && item.match !== 'not_found'
      && isRawFood(food) && !typedRaw);

    let cls = 'item';
    if (!food || needsGrams || noKcal || ambiguous || rawGuard) cls += ' item-warn';
    if (!food) cls += ' item-error';

    const row = h('div', { class: cls });

    // linha 1: nome + gramas + kcal
    const nameBtn = h('button', { class: 'item-name', title: 'Trocar alimento', onclick: () => openFoodSearch(searchQuery, pickFood) },
      food ? food.name + (food.custom ? ' ·meu' : '') : 'escolher alimento…');

    const gramsInput = h('input', {
      type: 'number', min: '0', step: '1', class: 'grams', value: item.grams != null ? round(item.grams, 0) : '',
      placeholder: 'g',
      onchange: e => {
        const v = e.target.value;
        item.grams = v === '' ? null : Number(String(v).replace(',', '.'));
        item.conf = 'exact'; item.note = '';
        window.Store.save(); renderHoje(); renderHist();
      },
    });

    // nome em cima (linha inteira), gramas + kcal embaixo
    row.appendChild(h('div', { class: 'item-head' }, [
      nameBtn,
      h('button', { class: 'del', title: 'Remover', onclick: () => { currentDay().items.splice(idx, 1); window.Store.save(); renderHoje(); renderHist(); } }, '✕'),
    ]));
    row.appendChild(h('div', { class: 'item-controls' }, [
      h('div', { class: 'item-qty' }, [gramsInput, h('span', { class: 'unit' }, 'g')]),
      h('select', {
        class: 'item-meal', title: 'Mover para outra refeição',
        onchange: e => { item.meal = e.target.value; window.Store.save(); renderHoje(); },
      }, MEALS.map(m => h('option', {
        value: m.id,
        selected: (MEAL_NOMES[item.meal] ? item.meal : mealPorHora()) === m.id ? 'selected' : null,
      }, m.nome))),
      h('div', { class: 'item-kcal' }, resolved && !noKcal ? round(n.kcal, 0) + ' kcal' : '—'),
    ]));

    // linha 2: macros
    if (resolved && !noKcal) {
      row.appendChild(h('div', { class: 'item-macros' }, [
        macroPill('P', n.prot, 'p'), macroPill('C', n.carb, 'c'), macroPill('G', n.fat, 'g'),
        n.fiber ? h('span', { class: 'fiber' }, 'fibra ' + round(n.fiber, 1) + ' g') : null,
      ]));
    }

    // badges/avisos
    const badges = h('div', { class: 'item-badges' });
    if (!food) badges.appendChild(badge('não encontrado', 'error'));
    if (ambiguous && food) badges.appendChild(badge('confirme o alimento', 'warn', 'Havia vários parecidos — este foi o palpite.'));
    if (noKcal) badges.appendChild(badge('sem valor na TACO — cadastre', 'error'));
    if (needsGrams && food) badges.appendChild(badge('informe as gramas', 'warn'));
    if (item.conf === 'estimate' && item.note) badges.appendChild(badge('estimativa', 'warn', item.note));
    if (rawGuard) badges.appendChild(badge('CRU — pesou cru?', 'warn', 'Se você pesou a comida já pronta, troque para a versão cozida — a diferença pode ser de 2 a 3 vezes nas calorias.'));
    if (badges.children.length) row.appendChild(badges);

    // troca rápida cru → cozido
    if (rawGuard) {
      const sibs = cookedSiblings(food);
      if (sibs.length) {
        row.appendChild(h('select', { class: 'cand', onchange: e => { if (e.target.value) pickFood(e.target.value); } }, [
          h('option', { value: '' }, 'pesei pronto → trocar para…'),
          ...sibs.map(s => {
            const tag = srcLabel(s);
            return h('option', { value: s.id }, s.name + (tag && tag !== 'TACO' ? '  [' + tag + ']' : ''));
          }),
        ]));
      }
    }

    // seletor de candidatos quando não encontrado ou ambíguo
    if (!food || ambiguous) {
      // usa o texto do alimento já isolado (importante p/ itens de foto);
      // cai no parse da linha crua só para itens antigos sem foodText
      const parsed = item.foodText
        ? window.Parser.matchFood(item.foodText)
        : window.Parser.parseLine(item.raw);
      if (parsed && parsed.candidates && parsed.candidates.length) {
        const sel = h('select', { class: 'cand', onchange: e => { if (e.target.value) pickFood(e.target.value); } }, [
          h('option', { value: '' }, food ? 'trocar / confirmar…' : 'escolher da base…'),
          ...parsed.candidates.map(c => {
            const f = window.Parser.getFood(c.id);
            if (!f) return null;
            const tag = srcLabel(f);
            return h('option', { value: c.id, selected: String(c.id) === String(item.foodId) ? 'selected' : null },
              f.name + (tag && tag !== 'TACO' ? '  [' + tag + ']' : ''));
          }).filter(Boolean),
        ]);
        row.appendChild(sel);
      }
      row.appendChild(h('button', { class: 'link-btn', onclick: () => openCustomFoodForm(searchQuery, newId => { item.foodId = newId; item.match = 'matched'; window.Store.save(); refreshFoods(); renderHoje(); renderHist(); renderAlimentos(); }) }, '+ cadastrar alimento'));
    }

    return row;
  }

  function macroPill(letter, grams, cls) {
    return h('span', { class: 'pill pill-' + cls }, letter + ' ' + round(grams, 1) + ' g');
  }
  function badge(text, kind, title) {
    return h('span', { class: 'badge badge-' + kind, title: title || '' }, text);
  }

  function renderDashboard(day) {
    const nutrients = day.items.map(itemNutrients).filter(n => n.hasKcal);
    const total = window.Nutrition.sumNutrients(nutrients);
    const eg = effectiveGoal();
    const goalK = eg.goalK;
    const mt = eg.mt;

    const wrap = h('div', { class: 'card dash' });
    wrap.appendChild(h('h3', {}, '📊 Resumo do dia'));

    const grid = h('div', { class: 'dash-grid' });
    // anel
    const ringWrap = h('div', { class: 'ring-wrap' });
    ringWrap.appendChild(window.Charts.ring(total.kcal, goalK || 0));
    grid.appendChild(ringWrap);

    // macros
    const rows = [
      { label: 'Proteína', value: total.prot, target: mt ? mt.protG : 0, color: 'var(--p)' },
      { label: 'Carbo', value: total.carb, target: mt ? mt.carbG : 0, color: 'var(--c)' },
      { label: 'Gordura', value: total.fat, target: mt ? mt.fatG : 0, color: 'var(--g)' },
    ];
    grid.appendChild(h('div', { class: 'bars-wrap' }, [window.Charts.macroBars(rows)]));
    wrap.appendChild(grid);

    if (!goalK) wrap.appendChild(h('p', { class: 'note' }, 'Defina seu perfil na aba Perfil para ver a meta.'));
    return wrap;
  }

  function renderWeightInput() {
    const pct = () => S.bodyComp[pesoDate] || {};
    const fmt1 = v => String(round(v, 1)).replace('.', ',');

    // linha derivada: com o peso do dia + %, mostra o equivalente em kg — só
    // do que foi preenchido (não derivamos massa magra de 100−gordura sozinhos)
    const derived = h('p', { class: 'hint comp-derived' });
    function updateDerived() {
      const w = S.weights[pesoDate], c = pct();
      const parts = [];
      if (w > 0 && c.fat != null) parts.push('≈ ' + fmt1(w * c.fat / 100) + ' kg de gordura');
      if (w > 0 && c.lean != null) parts.push('≈ ' + fmt1(w * c.lean / 100) + ' kg de massa magra');
      const excede = c.fat != null && c.lean != null && c.fat + c.lean > 100.5;
      derived.textContent = excede
        ? 'gordura + massa magra somam ' + fmt1(c.fat + c.lean) + '% — confira os valores'
        : parts.join(' · ');
      derived.className = 'hint comp-derived' + (excede ? ' comp-warn' : '');
      derived.style.display = derived.textContent ? '' : 'none';
    }

    function parseNum(raw) {
      if (raw === '') return null;
      const n = Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    function setPct(key, raw) {
      const v = parseNum(raw);
      const entry = Object.assign({}, pct());
      if (v == null) delete entry[key];
      else entry[key] = v;
      if (entry.fat == null && entry.lean == null) delete S.bodyComp[pesoDate];
      else S.bodyComp[pesoDate] = entry;
      window.Store.save(); updateDerived(); renderHist();
    }
    function numField(label, value, attrs, on) {
      return h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, label),
        h('input', Object.assign({
          type: 'number', min: '0', step: '0.1',
          value: value != null ? value : '',
          onchange: e => on(e.target.value),
        }, attrs)),
      ]);
    }

    // A data é do cartão, não do Diário: quem pesa hoje e só registra amanhã
    // precisa dizer de que dia é o número, sem sair da aba.
    const hoje = isoLocal(new Date());
    const dataRow = h('div', { class: 'peso-data' }, [
      h('label', { class: 'lbl' }, 'Data da pesagem'),
      h('input', {
        type: 'date', value: pesoDate, max: hoje, class: 'date-input',
        onchange: e => { pesoDate = e.target.value || pesoDate; renderSaude(); },
      }),
      pesoDate === hoje ? null
        : h('button', { class: 'link-btn', onclick: () => { pesoDate = hoje; renderSaude(); } }, 'hoje'),
    ]);

    const card = h('div', { class: 'card weight-card' }, [
      h('h3', {}, 'Peso e composição corporal'),
      dataRow,
      h('div', { class: 'comp-grid' }, [
        numField('Peso (kg)', S.weights[pesoDate], { placeholder: 'ex.: 82.4' }, raw => {
          const v = parseNum(raw);
          if (v == null) delete S.weights[pesoDate];
          else S.weights[pesoDate] = v;
          window.Store.save(); updateDerived(); renderHist();
        }),
        numField('Gordura (%)', pct().fat, { max: '100', placeholder: 'ex.: 24.5' }, raw => setPct('fat', raw)),
        numField('Massa magra (%)', pct().lean, { max: '100', placeholder: 'ex.: 72' }, raw => setPct('lean', raw)),
      ]),
      derived,
      h('p', { class: 'hint' }, 'Valores de ' + fmtBR(pesoDate) + ' — opcionais, registre quando medir. Gordura e massa magra: da balança de bioimpedância ou avaliação física.'),
    ]);
    updateDerived();
    return card;
  }

  // ================= ABA HISTÓRICO =================
  function renderHist() {
    // renderHist roda após toda mutação de dados (e no init) — gancho do
    // backup automático (com debounce; só age se estiver ligado)
    scheduleBackup();
    const root = $('#tab-hist');
    clear(root);
    const goalK = effectiveGoal().goalK;

    // série de kcal por dia
    const kcalSeries = Object.keys(S.days).sort().map(date => {
      const items = S.days[date].items || [];
      const tot = window.Nutrition.sumNutrients(items.map(it => window.Nutrition.itemNutrients(window.Parser.getFood(it.foodId), it.grams)).filter(n => n.hasKcal));
      return { date, value: items.length ? round(tot.kcal, 0) : null };
    }).filter(p => p.value != null);

    const weightSeries = Object.keys(S.weights).sort().map(date => ({ date, value: S.weights[date] }));
    // média móvel de 7 dias (tendência): o peso diário oscila ±1 kg por água/
    // glicogênio; a média é o sinal verdadeiro
    const weightMA = weightSeries.map(p => {
      const d0 = new Date(p.date + 'T12:00:00');
      const vals = weightSeries.filter(q => {
        const dq = new Date(q.date + 'T12:00:00');
        const diff = (d0 - dq) / 86400000;
        return diff >= 0 && diff < 7;
      }).map(q => q.value);
      return { date: p.date, value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100 };
    });

    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Calorias por dia'),
      window.Charts.lineChart(kcalSeries, { goalLine: goalK || null, color: 'var(--accent)', unit: ' kcal', zeroBase: true, empty: 'Registre alimentos para ver o histórico' }),
      kcalSeries.length ? h('p', { class: 'hint' }, 'Toque e arraste no gráfico para ver o valor de cada dia.') : null,
    ]));

    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Peso corporal'),
      window.Charts.lineChart(weightSeries, {
        color: 'var(--g)', unit: ' kg', decimals: 1, empty: 'Registre seu peso na aba Métricas',
        width: 1.5, lineOpacity: 0.4, pointR: 3,
        extra: weightSeries.length >= 3 ? [{ series: weightMA, color: 'var(--accent)', width: 2.5 }] : [],
      }),
      weightSeries.length >= 3 ? h('p', { class: 'hint' }, 'Pontos: pesagens · linha verde: média de 7 dias (a tendência que importa)') : null,
    ]));

    // composição corporal (opcional): os gráficos só aparecem se houver registro
    const bcDates = Object.keys(S.bodyComp || {}).sort();
    const fatSeries = bcDates.filter(d => S.bodyComp[d].fat != null).map(date => ({ date, value: S.bodyComp[date].fat }));
    const leanSeries = bcDates.filter(d => S.bodyComp[d].lean != null).map(date => ({ date, value: S.bodyComp[date].lean }));
    if (fatSeries.length) {
      root.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, 'Gordura corporal (%)'),
        window.Charts.lineChart(fatSeries, { color: 'var(--g)', unit: ' %', decimals: 1 }),
      ]));
    }
    if (leanSeries.length) {
      root.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, 'Massa magra (%)'),
        window.Charts.lineChart(leanSeries, { color: 'var(--p)', unit: ' %', decimals: 1 }),
      ]));
    }

    // tabela resumida (últimos 14 dias com registro)
    const dates = Object.keys(S.days).filter(d => (S.days[d].items || []).length).sort().reverse().slice(0, 14);
    if (dates.length) {
      const table = h('table', { class: 'histtable' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, 'Dia'), h('th', {}, 'kcal'), h('th', {}, 'P'), h('th', {}, 'C'), h('th', {}, 'G'), h('th', {}, 'Peso')])),
      ]);
      const tb = h('tbody');
      dates.forEach(date => {
        const items = S.days[date].items || [];
        const tot = window.Nutrition.sumNutrients(items.map(it => window.Nutrition.itemNutrients(window.Parser.getFood(it.foodId), it.grams)).filter(n => n.hasKcal));
        tb.appendChild(h('tr', {}, [
          h('td', {}, fmtBR(date)),
          h('td', {}, round(tot.kcal, 0)),
          h('td', {}, round(tot.prot, 0)),
          h('td', {}, round(tot.carb, 0)),
          h('td', {}, round(tot.fat, 0)),
          h('td', {}, S.weights[date] != null ? S.weights[date] : '—'),
        ]));
      });
      table.appendChild(tb);
      root.appendChild(h('div', { class: 'card' }, [h('h3', {}, 'Últimos dias'), table]));
    }
  }

  // ================= ABA PERFIL =================
  function renderPerfil() {
    const root = $('#tab-perfil');
    clear(root);
    const p = S.profile, g = S.goal;

    function field(label, node) { return h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), node]); }
    function numInput(val, on, step, min) {
      return h('input', { type: 'number', step: step || '1', min: min || '0', value: val != null ? val : '', class: 'in', onchange: e => { on(e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.'))); } });
    }

    const form = h('div', { class: 'card' }, [h('h3', {}, 'Seus dados')]);
    const grid = h('div', { class: 'form-grid' });

    grid.appendChild(field('Sexo', h('select', { class: 'in', onchange: e => { p.sex = e.target.value; save(); } }, [
      h('option', { value: 'm', selected: p.sex === 'm' ? 'selected' : null }, 'Masculino'),
      h('option', { value: 'f', selected: p.sex === 'f' ? 'selected' : null }, 'Feminino'),
    ])));
    grid.appendChild(field('Idade (anos)', numInput(p.age, v => { p.age = v; save(); })));
    grid.appendChild(field('Altura (cm)', numInput(p.height, v => { p.height = v; save(); })));
    grid.appendChild(field('Peso (kg)', numInput(p.weight, v => { p.weight = v; save(); }, '0.1')));
    grid.appendChild(field('Atividade', h('select', { class: 'in', onchange: e => { p.activity = Number(e.target.value); save(); } },
      Object.keys(window.Nutrition.ACTIVITY).map(k => h('option', { value: k, selected: String(p.activity) === k ? 'selected' : null }, window.Nutrition.ACTIVITY[k])))));
    form.appendChild(grid);
    root.appendChild(form);

    // meta
    const goalCard = h('div', { class: 'card' }, [h('h3', {}, 'Meta')]);
    const gGrid = h('div', { class: 'form-grid' });
    gGrid.appendChild(field('Ritmo de perda', h('select', { class: 'in', onchange: e => { g.pace = Number(e.target.value); g.deficit = null; g.manualKcal = null; save(); } }, [
      ['0', 'Manter peso'], ['0.25', '0,25 kg/semana'], ['0.5', '0,5 kg/semana'], ['0.75', '0,75 kg/semana'], ['1', '1 kg/semana'],
    ].map(([v, t]) => h('option', { value: v, selected: String(g.pace) === v && g.manualKcal == null ? 'selected' : null }, t)))));
    gGrid.appendChild(field('Proteína (g/kg)', numInput(g.proteinPerKg, v => { g.proteinPerKg = v; save(); }, '0.1')));
    gGrid.appendChild(field('Gordura (% das kcal)', numInput(Math.round((g.fatPct || 0.25) * 100), v => { g.fatPct = (v || 0) / 100; save(); })));
    gGrid.appendChild(field('Meta manual (kcal, opcional)', numInput(g.manualKcal, v => { g.manualKcal = v; save(); })));
    goalCard.appendChild(gGrid);

    // resultados (a Meta exibida é a EFETIVA — fórmula ou TDEE real)
    const bmr = window.Nutrition.bmr(p);
    const tdee = window.Nutrition.tdee(p);
    const eg = effectiveGoal();
    const goalK = eg.goalK;
    const mt = eg.mt;
    const results = h('div', { class: 'results' });
    if (bmr == null) {
      results.appendChild(h('p', { class: 'note' }, 'Preencha idade, altura e peso para calcular.'));
    } else {
      results.appendChild(statBox('TMB', round(bmr, 0), 'kcal/dia'));
      results.appendChild(statBox(eg.useAdapt ? 'TDEE real' : 'TDEE', eg.useAdapt ? eg.adaptive.tdee : round(tdee, 0), 'kcal/dia'));
      results.appendChild(statBox('Meta', goalK, 'kcal/dia'));
      if (mt) {
        results.appendChild(statBox('Proteína', mt.protG, 'g/dia'));
        results.appendChild(statBox('Carbo', mt.carbG, 'g/dia'));
        results.appendChild(statBox('Gordura', mt.fatG, 'g/dia'));
      }
    }
    goalCard.appendChild(results);

    // guardrail de segurança
    if (goalK != null) {
      const floor = window.Nutrition.floorKcal(p.sex);
      if (goalK < floor) {
        goalCard.appendChild(h('div', { class: 'warnbar' },
          `⚠ Meta de ${goalK} kcal está abaixo do piso seguro sugerido (${floor} kcal/dia para ${p.sex === 'f' ? 'mulheres' : 'homens'}). ` +
          'Dietas muito restritivas podem ser contraproducentes e devem ser acompanhadas. Ajuste o ritmo ou revise a meta manual.'));
      }
    }
    root.appendChild(goalCard);

    // ---- TDEE real (adaptativo) ----
    const ad = eg.adaptive;
    const adCard = h('div', { class: 'card' }, [
      h('h3', {}, '📈 TDEE real (observado)'),
      h('p', { class: 'note' }, 'Em vez de confiar na fórmula, calcula seu gasto real a partir do que você registrou e de como seu peso se moveu: média ingerida + 7.700 kcal × perda de peso. Absorve inclusive o seu viés de sub-registro.'),
    ]);
    if (!ad.ok) {
      const falta = ad.reason === 'poucos_dias'
        ? `Faltam dias de registro: ${ad.daysUsed} de ${10} necessários nos últimos ${ad.windowDays} dias.`
        : `Faltam pesagens: são necessárias 2+ com 10+ dias de intervalo (você tem ${ad.weighIns} pesagem(ns), intervalo de ${ad.spanDays} dia(s)).`;
      adCard.appendChild(h('p', { class: 'note' }, '⏳ Ainda sem dados suficientes. ' + falta + ' Continue registrando as refeições e pesando-se — isto se ativa sozinho.'));
    } else {
      const adResults = h('div', { class: 'results' });
      adResults.appendChild(statBox('TDEE real', ad.tdee, 'kcal/dia'));
      adResults.appendChild(statBox('Ingerido', ad.meanIntake, 'kcal/dia (média)'));
      adResults.appendChild(statBox('Peso', (ad.slopeKgWeek > 0 ? '+' : '') + ad.slopeKgWeek, 'kg/semana'));
      adCard.appendChild(adResults);
      adCard.appendChild(h('p', { class: 'hint' },
        `Base: últimos ${ad.windowDays} dias — ${ad.daysUsed} dias de registro válidos, ${ad.weighIns} pesagens em ${ad.spanDays} dias` +
        (ad.excludedDays ? ` (${ad.excludedDays} dia(s) com menos de 500 kcal ignorados como incompletos)` : '') + '. ' +
        `Fórmula estimava ${round(tdee, 0)} kcal — diferença de ${ad.tdee - Math.round(tdee || 0)} kcal/dia.`));
      if (ad.suspeito) {
        adCard.appendChild(h('div', { class: 'warnbar' }, '⚠ Valor fora da faixa fisiológica plausível — provavelmente há dias só parcialmente registrados ou pesagem atípica. O app NÃO vai usar este número na meta enquanto estiver assim.'));
      }
      const chk = h('input', {
        type: 'checkbox', id: 'use-adaptive',
        onchange: e => { g.useAdaptive = e.target.checked; save(); },
      });
      if (g.useAdaptive) chk.checked = true;
      if (ad.suspeito) chk.disabled = true;
      adCard.appendChild(h('div', { class: 'adaptive-toggle' }, [
        chk,
        h('label', { for: 'use-adaptive' }, ' Usar o TDEE real como base da minha meta (recomendado após 3+ semanas de registro)'),
      ]));
    }
    root.appendChild(adCard);

    function save() { window.Store.save(); renderPerfil(); renderHoje(); renderHist(); }
  }

  function statBox(label, value, unit) {
    return h('div', { class: 'stat' }, [
      h('div', { class: 'stat-val' }, value != null ? value : '—'),
      h('div', { class: 'stat-lbl' }, label),
      h('div', { class: 'stat-unit' }, unit),
    ]);
  }

  // ================= ABA ALIMENTOS =================
  // O lugar de cadastrar comida: alimentos individuais (valores do rótulo)
  // e receitas (soma de ingredientes). A aba Dados fica só p/ backup/config.
  function renderAlimentos() {
    const root = $('#tab-alimentos');
    clear(root);
    const done = () => { refreshFoods(); renderAlimentos(); renderHoje(); };

    // ----- alimentos individuais -----
    const plainFoods = S.customFoods.filter(f => !f.recipe);
    const cf = h('div', { class: 'card' }, [
      h('h3', {}, '🥩 Alimentos individuais'),
      h('p', { class: 'note' }, 'Cadastre o que não está na TACO (whey, leite integral, marcas específicas) com os valores do rótulo, por 100 g.'),
      h('button', { class: 'btn primary', onclick: () => openCustomFoodForm('', done) }, '+ Novo alimento'),
    ]);
    const cfList = h('div', { class: 'cf-list' });
    if (!plainFoods.length) cfList.appendChild(h('p', { class: 'empty' }, 'Nenhum alimento cadastrado ainda.'));
    plainFoods.forEach(f => {
      cfList.appendChild(h('div', { class: 'cf-item' }, [
        h('div', { class: 'cf-info' }, [
          f.labelPhoto ? h('img', { class: 'cf-thumb', src: f.labelPhoto, alt: 'rótulo', title: 'Foto do rótulo — a câmera reconhece este produto' }) : null,
          h('div', {}, [
            h('strong', {}, f.name),
            h('div', { class: 'hint' }, `${f.kcal != null ? f.kcal : '—'} kcal · P${f.prot != null ? f.prot : '—'} C${f.carb != null ? f.carb : '—'} G${f.fat != null ? f.fat : '—'} /100g` + (f.labelPhoto ? ' · 🏷️ rótulo salvo' : '')),
          ]),
        ]),
        h('div', {}, [
          h('button', { class: 'link-btn', onclick: () => openCustomFoodForm('', done, f) }, 'editar'),
          h('button', { class: 'link-btn danger', onclick: () => { if (confirm('Remover ' + f.name + '?')) { window.Store.removeCustomFood(f.id); done(); } } }, 'remover'),
        ]),
      ]));
    });
    cf.appendChild(cfList);
    root.appendChild(cf);

    // ----- receitas -----
    const recipes = S.customFoods.filter(f => f.recipe);
    const rc = h('div', { class: 'card' }, [
      h('h3', {}, '🍲 Receitas'),
      h('p', { class: 'note' }, 'Bolo, marmita, sopa… junte os ingredientes (texto ou foto) e a receita vira um alimento seu: depois registre “30 g bolo” na aba Hoje que as calorias saem na proporção.'),
      h('button', { class: 'btn primary', onclick: () => openRecipeForm(done) }, '+ Nova receita'),
    ]);
    const rcList = h('div', { class: 'cf-list' });
    if (!recipes.length) rcList.appendChild(h('p', { class: 'empty' }, 'Nenhuma receita ainda.'));
    recipes.forEach(f => {
      const r = f.recipe;
      const fw = r.finalWeight || r.ingredients.reduce((a, i) => a + (i.grams || 0), 0);
      const totKcal = f.kcal != null ? Math.round(f.kcal * fw / 100) : null;
      rcList.appendChild(h('div', { class: 'cf-item' }, [
        h('div', {}, [
          h('strong', {}, f.name),
          h('div', { class: 'hint' }, `${r.ingredients.length} ingrediente(s) · rende ${Math.round(fw)} g · ${totKcal != null ? totKcal : '—'} kcal no total · ${f.kcal != null ? f.kcal : '—'} kcal/100g`),
        ]),
        h('div', {}, [
          h('button', { class: 'link-btn', onclick: () => openRecipeForm(done, f) }, 'editar'),
          h('button', { class: 'link-btn danger', onclick: () => { if (confirm('Remover a receita ' + f.name + '? Registros antigos que a usam ficarão sem alimento.')) { window.Store.removeCustomFood(f.id); done(); } } }, 'remover'),
        ]),
      ]));
    });
    rc.appendChild(rcList);
    root.appendChild(rc);
  }

  // ================= ABA DADOS =================
  function renderDados() {
    const root = $('#tab-dados');
    clear(root);

    // conta primeiro: é o caminho recomendado para não perder dados
    root.appendChild(renderContaCard());
    root.appendChild(renderChaveCard());
    root.appendChild(renderNovidadesCard());

    // export/import + backup automático na nuvem
    const st0 = S.settings;
    const bkChk = h('input', {
      type: 'checkbox', id: 'auto-backup',
      onchange: e => {
        st0.autoBackup = e.target.checked;
        window.Store.save();
        if (st0.autoBackup) { scheduleBackup(); }
        renderDados();
      },
    });
    if (st0.autoBackup) bkChk.checked = true;
    const io = h('div', { class: 'card' }, [
      h('h3', {}, 'Backup e arquivos'),
      h('p', { class: 'note' }, window.Auth.logado()
        ? '✅ Sua conta já guarda tudo na nuvem automaticamente. O que está aqui embaixo é extra: arquivo no seu aparelho e o modo sigiloso.'
        : '⚠ Sem conta, os dados existem SÓ aqui — e no iPhone, REMOVER o app da tela de início APAGA tudo. O jeito seguro é entrar na conta (cartão acima); as opções abaixo são alternativas manuais.'),
      h('div', { class: 'adaptive-toggle' }, [
        bkChk,
        h('label', { for: 'auto-backup' }, ' 🔒 Backup sigiloso (modo antigo) — o diário é criptografado NESTE aparelho com a senha do app e guardado no proxy, de um jeito que NEM o servidor consegue ler. Em troca, não há recuperação: esquecer essa senha é perder o backup. Requer proxy + senha do app preenchidos abaixo.'),
      ]),
      h('p', { class: 'hint', id: 'bk-status' },
        st0.autoBackup
          ? (st0.lastBackupAt ? 'Último backup: ' + new Date(st0.lastBackupAt).toLocaleString('pt-BR') : 'Backup ligado — aguardando o primeiro envio…')
          : 'Backup automático desligado.'),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn primary', onclick: restoreBackup }, '☁ Restaurar da nuvem…'),
        h('button', { class: 'btn', onclick: doExport }, '⬇ Exportar JSON'),
        h('label', { class: 'btn' }, ['⬆ Importar (substituir)', h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => doImport(e, 'replace') })]),
        h('label', { class: 'btn' }, ['⬆ Importar (mesclar)', h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => doImport(e, 'merge') })]),
      ]),
    ]);
    root.appendChild(io);

    // Fase 2: registro por foto
    const st = S.settings;
    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, '⚙️ Servidor (avançado)'),
      h('p', { class: 'note' }, window.Auth.logado()
        ? 'Nada a preencher aqui: com a conta e a sua chave acima, tudo já funciona. Estes campos só servem para apontar o app para OUTRO servidor, ou para usar o backup sigiloso acima.'
        : 'Só preencha se você não vai usar conta: endereço de um proxy próprio e a senha dele. Com conta, isto fica em branco e tudo funciona.'),
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Endereço do servidor (em branco = o padrão do app)'),
        h('input', {
          type: 'url', class: 'in', placeholder: window.Auth.PROXY_PADRAO,
          value: st.proxyUrl || '',
          onchange: e => { st.proxyUrl = e.target.value.trim(); window.Store.save(); renderDados(); },
        }),
      ]),
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Senha do app (APP_TOKEN)'),
        h('input', {
          type: 'password', class: 'in', placeholder: 'a mesma configurada no proxy',
          value: st.proxyToken || '',
          onchange: e => { st.proxyToken = e.target.value.trim(); window.Store.save(); },
        }),
      ]),
      h('p', { class: 'hint' }, 'Cada foto ou análise custa centavos na conta de API de quem mantém o servidor. Itens de foto entram sempre como estimativa editável.'),
    ]));

    // fontes / sobre
    const db = window.FOOD_DB || {};
    const sobre = h('div', { class: 'card' }, [
      h('h3', {}, 'Sobre a base de alimentos'),
      h('p', { class: 'note' }, (db.foods ? db.foods.length : 0) + ' alimentos · valores por 100 g de parte comestível · versão ' + (db.version || '?') + '.'),
    ]);
    (db.sources || []).forEach(s => {
      sobre.appendChild(h('p', { class: 'note' }, [
        h('strong', {}, s.label + ' (' + s.count + ' alimentos): '),
        s.detail + ' ',
        h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.url),
      ]));
    });
    sobre.appendChild(h('button', { class: 'btn danger', onclick: doReset }, 'Apagar tudo'));
    root.appendChild(sobre);
  }

  function doExport() {
    const blob = new Blob([window.Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'highlander-' + isoLocal(new Date()) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function doImport(e, mode) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        if (mode === 'replace' && !confirm('Isso vai SUBSTITUIR todos os dados atuais. Continuar?')) return;
        window.Store.importJSON(r.result, mode);
        S = window.Store.get();
        refreshFoods();
        renderAll();
        toast('Importado com sucesso ✅', 'ok');
      } catch (err) {
        alert('Não consegui ler o arquivo: ' + err.message);
      }
    };
    r.readAsText(file);
    e.target.value = '';
  }
  function doReset() {
    if (!confirm('Apagar TODOS os dados (perfil, histórico, alimentos)? Faça um export antes se quiser backup.')) return;
    if (!confirm('Tem certeza? Isso não tem volta.')) return;
    S = window.Store.reset();
    refreshFoods();
    currentDate = isoLocal(new Date());
    pesoDate = currentDate;
    renderAll();
  }

  // ================= ÁREA EXAMES =================
  // Duas abas: Laboratoriais (1 linha por analito — vira gráfico de evolução)
  // e Imagem (data + resumo do laudo). Lembretes "repetir a cada N meses"
  // avisam aqui, na aba Hoje e com a bolinha no botão Exames.
  const ANALITOS_COMUNS = [
    'Glicose em jejum', 'Hemoglobina glicada (HbA1c)', 'Insulina', 'Colesterol total',
    'HDL', 'LDL', 'Triglicerídeos', 'TSH', 'T4 livre', 'Creatinina', 'Ureia',
    'TGO (AST)', 'TGP (ALT)', 'GGT', 'Vitamina D (25-OH)', 'Vitamina B12',
    'Ferritina', 'Ferro', 'Ácido úrico', 'Hemoglobina', 'Hematócrito',
    'Leucócitos', 'Plaquetas', 'PCR ultrassensível', 'Testosterona total',
    'Sódio', 'Potássio',
  ];
  const IMAGEM_COMUNS = [
    'Ultrassom de abdome total', 'Ultrassom de tireoide', 'Raio-X de tórax',
    'Tomografia', 'Ressonância magnética', 'Densitometria óssea',
    'Ecocardiograma', 'Teste ergométrico', 'Eletrocardiograma',
    'Angiotomografia de coronárias', 'Endoscopia digestiva alta',
    'Colonoscopia', 'Mamografia', 'Doppler de carótidas',
  ];

  function uid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function numFromText(raw) {
    const n = Number(String(raw).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null; // "não reagente" fica só como texto
  }
  function addMonths(iso, months) {
    const d = new Date(iso + 'T12:00:00');
    d.setMonth(d.getMonth() + months);
    return isoLocal(d);
  }
  function reminderDue(r) {
    const due = addMonths(r.baseDate, r.months);
    const days = Math.round((new Date(due + 'T12:00:00') - new Date(isoLocal(new Date()) + 'T12:00:00')) / 86400000);
    return { due, days }; // days <= 0 → vencido (ou vence hoje)
  }
  // salvar + repintar tudo que mostra exames/lembretes (inclui backup automático)
  function saveExams() {
    window.Store.save();
    scheduleBackup();
    renderExLab(); renderExImg(); updateNavBadges(); renderHoje();
    sincronizarOpenBrain();  // exame novo vai para o Open Brain na hora
  }

  // Dispara o envio ao Open Brain sem travar a interface: o servidor decide o
  // que ainda falta mandar (tem o próprio livro-caixa), então chamar demais é
  // inofensivo — e o silêncio no erro é proposital, isto é acessório e não
  // pode atrapalhar quem só quis registrar um exame.
  let obEnviando = false;
  function sincronizarOpenBrain() {
    if (obEnviando || !window.Auth.logado() || !S.settings.openBrain) return;
    obEnviando = true;
    // espera o backup subir: o servidor lê os dados da NUVEM, não do aparelho
    setTimeout(() => {
      fetch(window.Auth.urlProxy('/openbrain/sync'), {
        method: 'POST',
        headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
        body: '{}',
      }).catch(() => {}).finally(() => { obEnviando = false; });
    }, 5000);
  }
  // exame novo do mesmo nome empurra o lembrete p/ frente (a contagem recomeça)
  function bumpReminders(kind, norm, date) {
    (S.examReminders || []).forEach(r => {
      if (r.kind === kind && r.norm === norm && date > r.baseDate) r.baseDate = date;
    });
  }
  function sugestoesDeNomes(kind) {
    const proprios = (kind === 'lab' ? S.labExams : S.imgExams).map(x => x.name);
    const base = kind === 'lab'
      ? ['Hemograma completo', 'Perfil lipídico', 'Check-up de sangue'].concat(ANALITOS_COMUNS)
      : IMAGEM_COMUNS;
    return [...new Set(proprios.concat(base))];
  }

  // ---- lembretes (card compartilhado pelas duas abas, filtrado por tipo) ----
  function renderRemindersCard(kind) {
    const card = h('div', { class: 'card' }, [h('h3', {}, '🔔 Lembretes de repetição')]);
    const list = (S.examReminders || []).filter(r => r.kind === kind)
      .map(r => ({ r, d: reminderDue(r) }))
      .sort((a, b) => a.d.days - b.d.days);
    if (!list.length) {
      card.appendChild(h('p', { class: 'note' }, 'Nenhum lembrete ainda. Crie um para o app avisar quando chegar a hora de repetir (ex.: a cada 12 meses). O aviso aparece aqui, na aba Hoje e na bolinha do botão Exames.'));
    }
    list.forEach(({ r, d }) => {
      const cls = d.days <= 0 ? ' due' : (d.days <= 30 ? ' soon' : '');
      const quando = d.days < 0 ? '🔔 está na hora! venceu ' + fmtBR(d.due) + ' (' + (-d.days) + ' dia(s) atrás)'
        : d.days === 0 ? '🔔 está na hora! vence HOJE'
        : 'próximo em ' + fmtBR(d.due) + ' (faltam ' + d.days + ' dia(s))';
      card.appendChild(h('div', { class: 'rem-item' + cls }, [
        h('div', { class: 'rem-info' }, [
          h('div', {}, [h('strong', {}, r.name), ' · a cada ' + r.months + (r.months === 1 ? ' mês' : ' meses')]),
          h('div', { class: 'rem-when' }, 'último: ' + fmtBR(r.baseDate) + ' · ' + quando),
        ]),
        h('div', { class: 'rem-actions' }, [
          h('button', { class: 'link-btn', title: 'Fiz o exame hoje — recomeça a contagem', onclick: () => { r.baseDate = isoLocal(new Date()); saveExams(); } }, '✓ feito hoje'),
          h('button', { class: 'del', title: 'Remover lembrete', onclick: () => { if (confirm('Remover o lembrete de ' + r.name + '?')) { S.examReminders = S.examReminders.filter(x => x.id !== r.id); saveExams(); } } }, '✕'),
        ]),
      ]));
    });

    const nameIn = h('input', { class: 'in', type: 'text', list: 'dl-rem-' + kind, placeholder: kind === 'lab' ? 'ex.: Hemograma completo' : 'ex.: Ultrassom de abdome total' });
    const monthsIn = h('input', { class: 'in', type: 'number', min: '1', step: '1', placeholder: 'ex.: 12' });
    const baseIn = h('input', { class: 'in', type: 'date', value: isoLocal(new Date()) });
    // escolheu um exame já anotado? "último feito" vira a data mais recente dele
    nameIn.addEventListener('change', () => {
      const norm = window.Parser.normalize(nameIn.value);
      const datas = (kind === 'lab' ? S.labExams : S.imgExams).filter(x => x.norm === norm).map(x => x.date).sort();
      if (datas.length) baseIn.value = datas[datas.length - 1];
    });
    card.appendChild(h('details', { class: 'exam-group' }, [
      h('summary', {}, [h('span', { class: 'meal-chev' }, '›'), '+ Novo lembrete']),
      h('div', { class: 'exam-form-grid', style: 'margin-top:8px' }, [
        h('div', { class: 'field span2' }, [
          h('label', { class: 'lbl' }, 'Exame'), nameIn,
          h('datalist', { id: 'dl-rem-' + kind }, sugestoesDeNomes(kind).map(n => h('option', { value: n }))),
        ]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Repetir a cada (meses)'), monthsIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Último feito em'), baseIn]),
        h('div', { class: 'span2' }, h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameIn.value.trim();
            const months = Number(String(monthsIn.value).replace(',', '.'));
            if (!name) { toast('Dê um nome ao exame.', 'error'); return; }
            if (!(months >= 1)) { toast('Informe de quantos em quantos meses repetir (mínimo 1).', 'error'); return; }
            S.examReminders.push({ id: uid('r'), name, norm: window.Parser.normalize(name), kind, months: Math.round(months), baseDate: baseIn.value || isoLocal(new Date()) });
            saveExams();
            toast('Lembrete criado ✅', 'ok');
          },
        }, 'Criar lembrete')),
      ]),
    ]));
    return card;
  }

  // ---- exames LABORATORIAIS ----
  let labDraftDate = null;   // mantém a data entre um analito e o próximo
  let labEvoSel = null;      // analito escolhido no gráfico de evolução

  function renderExLab() {
    const root = $('#tab-exlab');
    if (!root) return;
    clear(root);
    root.appendChild(renderRemindersCard('lab'));
    root.appendChild(renderLabForm());
    const evo = renderLabEvolution();
    if (evo) root.appendChild(evo);
    root.appendChild(renderLabHistory());
    root.appendChild(renderAnalysisCard());
  }

  // ---- conferência do laudo laboratorial lido por foto/PDF ----
  // Cada analito vem marcado e editável. O usuário aprova o que entra: o app
  // NÃO salva transcrição de exame às cegas.
  function abrirConferenciaLab(dados, aoSalvar) {
    const d = dados || {};
    const analitos = Array.isArray(d.analitos) ? d.analitos : [];
    const corpo = h('div', {});
    const m = modal('Conferir o laudo', corpo);

    if (!analitos.length) {
      corpo.appendChild(h('p', { class: 'note' }, 'Não consegui extrair nenhum resultado deste arquivo.'
        + (d.observacao ? ' Observação da leitura: ' + d.observacao : '')));
      corpo.appendChild(h('p', { class: 'hint' }, 'Tente uma foto mais próxima e com boa luz, o PDF original em vez da foto da tela, ou lance os valores à mão no formulário.'));
      corpo.appendChild(h('div', { class: 'btn-row' }, [h('button', { class: 'btn', onclick: () => m.close() }, 'Fechar')]));
      return m;
    }

    const dataIn = h('input', { class: 'in', type: 'date', value: d.data || labDraftDate || isoLocal(new Date()) });
    corpo.appendChild(h('p', { class: 'note' }, 'Li ' + analitos.length + ' resultado(s). '
      + '⚠ Confira antes de salvar — transcrição automática erra, e aqui o erro custa caro. '
      + 'Desmarque o que não quiser e corrija o que estiver errado.'));
    if (d.laboratorio) corpo.appendChild(h('p', { class: 'hint' }, 'Laboratório: ' + d.laboratorio));
    if (d.observacao) corpo.appendChild(h('p', { class: 'hint comp-warn' }, '⚠ ' + d.observacao));
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Data da coleta (vale para todos)'), dataIn]));
    if (!d.data) corpo.appendChild(h('p', { class: 'hint comp-warn' }, 'Não achei a data no documento — confira acima.'));

    const linhas = analitos.map(a => {
      const usar = h('input', { type: 'checkbox' });
      usar.checked = true;
      const nome = h('input', { class: 'in', type: 'text', value: a.nome || '' });
      const valor = h('input', { class: 'in', type: 'text', value: a.valor != null ? a.valor : '' });
      const unidade = h('input', { class: 'in', type: 'text', value: a.unidade || '', placeholder: 'unidade' });
      const lo = h('input', { class: 'in', type: 'number', step: 'any', value: a.refMin != null ? a.refMin : '', placeholder: 'ref. mín.' });
      const hi = h('input', { class: 'in', type: 'number', step: 'any', value: a.refMax != null ? a.refMax : '', placeholder: 'ref. máx.' });
      const linha = h('div', { class: 'conf-linha' }, [
        h('label', { class: 'conf-usar' }, [usar, h('span', {}, 'incluir')]),
        h('div', { class: 'conf-campos' }, [
          nome,
          h('div', { class: 'conf-tres' }, [valor, unidade]),
          h('div', { class: 'conf-tres' }, [lo, hi]),
          a.obs ? h('p', { class: 'hint' }, a.obs) : null,
        ]),
      ]);
      return { linha, usar, nome, valor, unidade, lo, hi, obs: a.obs || '' };
    });
    const lista = h('div', { class: 'conf-lista' }, linhas.map(l => l.linha));
    corpo.appendChild(lista);

    corpo.appendChild(h('div', { class: 'btn-row' }, [
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const date = dataIn.value || isoLocal(new Date());
          const escolhidos = linhas.filter(l => l.usar.checked && l.nome.value.trim() && l.valor.value.trim());
          if (!escolhidos.length) { toast('Marque ao menos um resultado.', 'error'); return; }
          escolhidos.forEach(l => {
            const name = l.nome.value.trim();
            const norm = window.Parser.normalize(name);
            const raw = l.valor.value.trim();
            S.labExams.push({
              id: uid('l'), date, name, norm, value: raw, num: numFromText(raw),
              unit: l.unidade.value.trim(), refLow: numOrNull(l.lo.value), refHigh: numOrNull(l.hi.value),
              obs: l.obs,
            });
            bumpReminders('lab', norm, date);
          });
          labDraftDate = date;
          saveExams();
          m.close();
          toast(escolhidos.length + ' resultado(s) adicionado(s) ✅', 'ok');
          if (aoSalvar) aoSalvar();
        },
      }, 'Adicionar os marcados'),
      h('button', { class: 'btn', onclick: () => { linhas.forEach(l => { l.usar.checked = false; }); } }, 'Desmarcar todos'),
      h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
    ]));
    corpo.appendChild(h('p', { class: 'hint' }, 'A faixa de referência só vem preenchida quando está impressa no laudo — o app nunca inventa uma. O arquivo em si não é guardado.'));
    return m;
  }

  function renderLabForm() {
    const dateIn = h('input', { class: 'in', type: 'date', value: labDraftDate || isoLocal(new Date()), onchange: e => { labDraftDate = e.target.value; } });
    const nameIn = h('input', { class: 'in', type: 'text', list: 'dl-analitos', placeholder: 'ex.: Glicose em jejum' });
    const valueIn = h('input', { class: 'in', type: 'text', inputmode: 'decimal', placeholder: 'ex.: 92 (ou “não reagente”)' });
    const unitIn = h('input', { class: 'in', type: 'text', placeholder: 'ex.: mg/dL' });
    const loIn = h('input', { class: 'in', type: 'number', step: 'any', placeholder: 'opcional' });
    const hiIn = h('input', { class: 'in', type: 'number', step: 'any', placeholder: 'opcional' });
    const obsIn = h('input', { class: 'in', type: 'text', placeholder: 'opcional, ex.: em jejum de 12 h' });
    // analito repetido: puxa unidade e faixa do lançamento anterior
    nameIn.addEventListener('change', () => {
      const norm = window.Parser.normalize(nameIn.value);
      const prev = S.labExams.filter(x => x.norm === norm).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
      if (!prev) return;
      if (!unitIn.value) unitIn.value = prev.unit || '';
      if (!loIn.value && prev.refLow != null) loIn.value = prev.refLow;
      if (!hiIn.value && prev.refHigh != null) hiIn.value = prev.refHigh;
    });
    return h('div', { class: 'card' }, [
      h('h3', {}, '➕ Novo resultado'),
      h('p', { class: 'note' }, 'O jeito rápido: fotografe o laudo ou carregue o PDF que o app transcreve os analitos de uma vez — você confere antes de salvar. Ou lance um por vez no formulário abaixo.'),
      botoesLaudo('exame_lab', dados => abrirConferenciaLab(dados.exameLab, () => renderExLab())),
      h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'O laudo inteiro é enviado para a IA com a SUA chave (custa centavos). O arquivo não é guardado; só os valores que você aprovar.'),
      h('div', { class: 'exam-form-grid' }, [
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Data da coleta'), dateIn]),
        h('div', { class: 'field' }, [
          h('label', { class: 'lbl' }, 'Exame / analito'), nameIn,
          h('datalist', { id: 'dl-analitos' }, sugestoesDeNomes('lab').map(n => h('option', { value: n }))),
        ]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Resultado'), valueIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Unidade'), unitIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Referência mín.'), loIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Referência máx.'), hiIn]),
        h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Observação'), obsIn]),
        h('div', { class: 'span2' }, h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameIn.value.trim();
            const raw = valueIn.value.trim();
            if (!name) { toast('Qual exame? Preencha o nome.', 'error'); return; }
            if (!raw) { toast('Preencha o resultado.', 'error'); return; }
            const date = dateIn.value || isoLocal(new Date());
            const norm = window.Parser.normalize(name);
            labDraftDate = date;
            S.labExams.push({
              id: uid('l'), date, name, norm, value: raw, num: numFromText(raw),
              unit: unitIn.value.trim(), refLow: numOrNull(loIn.value), refHigh: numOrNull(hiIn.value),
              obs: obsIn.value.trim(),
            });
            bumpReminders('lab', norm, date);
            saveExams();
            toast(name + ' anotado ✅ Pode lançar o próximo analito.', 'ok');
          },
        }, '+ Adicionar resultado')),
      ]),
    ]);
  }

  function labBadge(x) {
    if (x.num == null || (x.refLow == null && x.refHigh == null)) return null;
    if (x.refHigh != null && x.num > x.refHigh) return badge('↑ acima', 'error');
    if (x.refLow != null && x.num < x.refLow) return badge('↓ abaixo', 'error');
    return h('span', { class: 'badge badge-ok', title: 'dentro da referência anotada' }, '✓');
  }

  function renderLabHistory() {
    const card = h('div', { class: 'card' }, [h('h3', {}, '📋 Resultados por coleta')]);
    if (!S.labExams.length) {
      card.appendChild(h('p', { class: 'empty' }, 'Nenhum resultado anotado ainda.'));
      return card;
    }
    const byDate = {};
    S.labExams.forEach(x => (byDate[x.date] = byDate[x.date] || []).push(x));
    Object.keys(byDate).sort().reverse().forEach((date, di) => {
      const rows = byDate[date];
      const tb = h('tbody');
      rows.forEach(x => {
        tb.appendChild(h('tr', {}, [
          h('td', { title: x.obs || '' }, x.name + (x.obs ? ' *' : '')),
          h('td', {}, [String(x.value) + (x.unit ? ' ' + x.unit : ''), ' ', labBadge(x)]),
          h('td', {}, (x.refLow != null || x.refHigh != null)
            ? (x.refLow != null ? x.refLow : '—') + ' a ' + (x.refHigh != null ? x.refHigh : '—')
            : '—'),
          h('td', {}, h('button', { class: 'del', title: 'Remover', onclick: () => { if (confirm('Remover ' + x.name + ' de ' + fmtBR(date) + '?')) { S.labExams = S.labExams.filter(y => y.id !== x.id); saveExams(); } } }, '✕')),
        ]));
      });
      card.appendChild(h('details', { class: 'exam-group', open: di === 0 ? 'open' : null }, [
        h('summary', {}, [h('span', { class: 'meal-chev' }, '›'), '🧪 ' + fmtBR(date), h('span', { class: 'g-meta' }, rows.length + ' analito(s)')]),
        h('table', { class: 'histtable exam-table' }, [
          h('thead', {}, h('tr', {}, [h('th', {}, 'Exame'), h('th', {}, 'Resultado'), h('th', {}, 'Referência'), h('th', {}, '')])),
          tb,
        ]),
      ]));
    });
    return card;
  }

  function renderLabEvolution() {
    const byNorm = {};
    S.labExams.filter(x => x.num != null).forEach(x => (byNorm[x.norm] = byNorm[x.norm] || []).push(x));
    const opcoes = Object.keys(byNorm).filter(k => byNorm[k].length >= 2).sort();
    if (!opcoes.length) return null;
    if (!labEvoSel || opcoes.indexOf(labEvoSel) === -1) labEvoSel = opcoes[0];
    const rows = byNorm[labEvoSel].sort((a, b) => (a.date < b.date ? -1 : 1));
    const porData = {};
    rows.forEach(x => { porData[x.date] = x.num; }); // mesmo dia repetido: vale o último
    const series = Object.keys(porData).sort().map(date => ({ date, value: porData[date] }));
    const ultimo = rows[rows.length - 1];
    const maxAbs = Math.max(...series.map(p => Math.abs(p.value)));
    const dec = maxAbs >= 100 ? 0 : (maxAbs >= 10 ? 1 : 2);
    const flat = v => [{ date: series[0].date, value: v }, { date: series[series.length - 1].date, value: v }];
    const extra = [];
    if (ultimo.refLow != null) extra.push({ series: flat(ultimo.refLow), color: 'var(--warn)', width: 1.5, dash: '5 4' });
    if (ultimo.refHigh != null) extra.push({ series: flat(ultimo.refHigh), color: 'var(--warn)', width: 1.5, dash: '5 4' });
    return h('div', { class: 'card' }, [
      h('h3', {}, '📈 Evolução'),
      h('select', { class: 'in', onchange: e => { labEvoSel = e.target.value; renderExLab(); } },
        opcoes.map(k => h('option', { value: k, selected: k === labEvoSel ? 'selected' : null }, byNorm[k][byNorm[k].length - 1].name))),
      window.Charts.lineChart(series, { color: 'var(--p)', unit: ultimo.unit ? ' ' + ultimo.unit : '', decimals: dec, extra }),
      extra.length ? h('p', { class: 'hint' }, 'Tracejado: faixa de referência anotada no exame mais recente. Toque no gráfico para ver cada valor.') : h('p', { class: 'hint' }, 'Toque no gráfico para ver cada valor.'),
    ]);
  }

  // ---- exames de IMAGEM ----
  let imgDraftDate = null;

  function renderExImg() {
    const root = $('#tab-eximg');
    if (!root) return;
    clear(root);
    root.appendChild(renderRemindersCard('img'));
    root.appendChild(renderImgForm());
    root.appendChild(renderImgList());
    root.appendChild(renderAnalysisCard());
  }

  function renderImgForm() {
    const dateIn = h('input', { class: 'in', type: 'date', value: imgDraftDate || isoLocal(new Date()), onchange: e => { imgDraftDate = e.target.value; } });
    const nameIn = h('input', { class: 'in', type: 'text', list: 'dl-imagem', placeholder: 'ex.: Ultrassom de abdome total' });
    const placeIn = h('input', { class: 'in', type: 'text', placeholder: 'opcional' });
    const reportIn = h('textarea', { rows: '4', placeholder: 'conclusão do laudo, achados, medidas…' });
    // preenche o formulário a partir do laudo lido, sem apagar o que a pessoa
    // já tinha digitado à mão
    const preencher = (r) => {
      if (!r) return;
      if (r.data) { dateIn.value = r.data; imgDraftDate = r.data; }
      if (r.exame && !nameIn.value.trim()) nameIn.value = r.exame;
      if (r.local && !placeIn.value.trim()) placeIn.value = r.local;
      if (r.conclusao) {
        reportIn.value = reportIn.value.trim()
          ? reportIn.value.trim() + '\n\n' + r.conclusao
          : r.conclusao;
      }
      const aviso = [];
      if (!r.data) aviso.push('não achei a data');
      if (!r.exame) aviso.push('não achei o nome do exame');
      if (!r.conclusao) aviso.push('não achei a conclusão');
      if (r.observacao) aviso.push(r.observacao);
      toast(aviso.length
        ? '⚠ Confira o que foi preenchido — ' + aviso.join('; ') + '.'
        : 'Preenchido do laudo ✅ Confira antes de salvar.', aviso.length ? 'error' : 'ok');
    };

    return h('div', { class: 'card' }, [
      h('h3', {}, '➕ Novo exame de imagem'),
      h('p', { class: 'note' }, 'Fotografe o laudo ou carregue o PDF que o app preenche os campos — você confere e corrige antes de salvar. Ou escreva à mão, como preferir.'),
      botoesLaudo('exame_img', dados => preencher(dados.exameImg)),
      h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'O laudo é enviado para a IA com a SUA chave (custa centavos). O arquivo não é guardado; só o texto que você salvar.'),
      h('div', { class: 'exam-form-grid' }, [
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Data'), dateIn]),
        h('div', { class: 'field' }, [
          h('label', { class: 'lbl' }, 'Exame'), nameIn,
          h('datalist', { id: 'dl-imagem' }, sugestoesDeNomes('img').map(n => h('option', { value: n }))),
        ]),
        h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Local / clínica'), placeIn]),
        h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Resumo do laudo'), reportIn]),
        h('div', { class: 'span2' }, h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameIn.value.trim();
            if (!name) { toast('Qual exame? Preencha o nome.', 'error'); return; }
            const date = dateIn.value || isoLocal(new Date());
            const norm = window.Parser.normalize(name);
            imgDraftDate = date;
            S.imgExams.push({ id: uid('i'), date, name, norm, place: placeIn.value.trim(), report: reportIn.value.trim() });
            bumpReminders('img', norm, date);
            saveExams();
            toast(name + ' anotado ✅', 'ok');
          },
        }, '+ Adicionar exame')),
      ]),
    ]);
  }

  function renderImgList() {
    const card = h('div', { class: 'card' }, [h('h3', {}, '📋 Exames de imagem')]);
    if (!S.imgExams.length) {
      card.appendChild(h('p', { class: 'empty' }, 'Nenhum exame de imagem anotado ainda.'));
      return card;
    }
    S.imgExams.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((x, i) => {
      const body = h('div');
      const view = () => {
        clear(body);
        body.appendChild(x.report ? h('p', { class: 'exam-report' }, x.report) : h('p', { class: 'hint' }, 'Sem resumo do laudo.'));
        if (x.place) body.appendChild(h('p', { class: 'hint' }, '📍 ' + x.place));
        body.appendChild(h('div', { class: 'btn-row' }, [
          h('button', { class: 'link-btn', onclick: edit }, '✏️ editar'),
          h('button', { class: 'link-btn danger', onclick: () => { if (confirm('Remover ' + x.name + ' de ' + fmtBR(x.date) + '?')) { S.imgExams = S.imgExams.filter(y => y.id !== x.id); saveExams(); } } }, 'remover'),
        ]));
      };
      const edit = () => {
        clear(body);
        const ta = h('textarea', { rows: '5' }, x.report || '');
        const pl = h('input', { class: 'in', type: 'text', value: x.place || '', placeholder: 'local/clínica' });
        body.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Resumo do laudo'), ta]));
        body.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Local / clínica'), pl]));
        body.appendChild(h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn primary', onclick: () => { x.report = ta.value.trim(); x.place = pl.value.trim(); saveExams(); } }, 'Salvar'),
          h('button', { class: 'btn', onclick: view }, 'Cancelar'),
        ]));
      };
      view();
      card.appendChild(h('details', { class: 'exam-group', open: i === 0 ? 'open' : null }, [
        h('summary', {}, [h('span', { class: 'meal-chev' }, '›'), '🩻 ' + fmtBR(x.date) + ' — ' + x.name]),
        body,
      ]));
    });
    return card;
  }

  // ================= ÁREA MÉTRICAS DE SAÚDE (Apple Health) =================
  const METRIC_VIEW = {
    steps:     { label: 'Passos por dia', unit: '', dec: 0 },
    kcalOut:   { label: 'Energia ativa (kcal/dia)', unit: ' kcal', dec: 0 },
    kcalBasal: { label: 'Energia basal (kcal/dia)', unit: ' kcal', dec: 0 },
    exMin:     { label: 'Exercício (min/dia)', unit: ' min', dec: 0 },
    sleepMin:  { label: 'Sono (horas por noite)', unit: ' h', dec: 1, conv: v => v / 60 },
    hrRest:    { label: 'FC de repouso (bpm)', unit: ' bpm', dec: 0 },
    hrv:       { label: 'Variabilidade da FC (ms)', unit: ' ms', dec: 1 },
    vo2max:    { label: 'VO₂máx (mL/kg·min)', unit: '', dec: 1 },
    distKm:    { label: 'Distância (km/dia)', unit: ' km', dec: 1 },
  };
  let saudeMetric = 'steps';
  let saudePeriod = '90';
  let healthImporting = false;

  function mediaDe(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
  function fmtDec(v, dec) { return v == null ? '—' : String(round(v, dec)).replace('.', ','); }

  function renderSaude() {
    const root = $('#tab-saude');
    if (!root) return;
    clear(root);
    // peso e composição primeiro: é o que se digita toda semana, enquanto o
    // import do app Saúde é raro — quem entra aqui todo dia não deve rolar
    // um cartão de instruções para chegar ao campo
    root.appendChild(renderWeightInput());
    root.appendChild(renderHealthImport());
    const dates = Object.keys(S.health.daily || {}).sort();
    if (dates.length) {
      root.appendChild(renderHealthStats(dates));
      root.appendChild(renderHealthChart(dates));
      const bal = renderEnergyBalance();
      if (bal) root.appendChild(bal);
    }
    root.appendChild(renderAnalysisCard());
  }

  function renderHealthImport() {
    const bar = h('div', { class: 'progress-bar' });
    const track = h('div', { class: 'progress-track', style: 'display:none' }, bar);
    const periodo = h('select', { class: 'in' }, [
      ['1', 'último 1 ano'], ['2', 'últimos 2 anos'], ['3', 'últimos 3 anos'],
      ['5', 'últimos 5 anos'], ['0', 'tudo que houver'],
    ].map(([v, t]) => h('option', { value: v, selected: v === '3' ? 'selected' : null }, t)));
    const fileIn = h('input', {
      type: 'file', accept: '.zip,.xml,application/zip,text/xml,application/xml', style: 'display:none',
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); },
    });
    const pickBtn = h('button', { class: 'btn primary', onclick: () => fileIn.click() }, '📂 Escolher o arquivo do export');

    async function doImport(file) {
      if (healthImporting) return;
      healthImporting = true;
      pickBtn.disabled = true;
      pickBtn.textContent = '⏳ lendo o arquivo…';
      track.style.display = '';
      const anos = Number(periodo.value);
      const fromDate = anos ? shiftDate(isoLocal(new Date()), -Math.round(anos * 365.25)) : null;
      try {
        const res = await window.HealthKit.parseExportFile(file, {
          fromDate,
          onProgress: f => { bar.style.width = Math.round(f * 100) + '%'; },
        });
        if (!res.records) throw new Error('nenhum registro reconhecido — este é o export do app Saúde?');
        Object.assign(S.health.daily, res.daily); // mescla por dia: reimportar atualiza
        S.health.lastImportAt = new Date().toISOString();
        window.Store.save();
        scheduleBackup();
        healthImporting = false;
        toast('Importado: ' + Object.keys(res.daily).length + ' dia(s), de ' + fmtBR(res.firstDate) + ' a ' + fmtBR(res.lastDate) + ' ✅', 'ok');
        renderSaude();
      } catch (err) {
        healthImporting = false;
        pickBtn.disabled = false;
        pickBtn.textContent = '📂 Escolher o arquivo do export';
        track.style.display = 'none';
        toast('Não consegui importar: ' + err.message, 'error');
      }
    }

    const card = h('div', { class: 'card' }, [
      h('h3', {}, '⌚ Importar do app Saúde (iPhone)'),
      h('p', { class: 'note' }, 'Passos, energia, sono, FC de repouso, VO₂máx e mais — do Apple Watch e do iPhone — para cruzar com a dieta e os exames. O arquivo é processado NESTE aparelho; nada sobe para servidor nenhum.'),
      h('ol', { class: 'import-steps' }, [
        h('li', {}, 'No iPhone, abra o app Saúde e toque na sua foto de perfil (canto superior direito).'),
        h('li', {}, 'Toque em “Exportar Todos os Dados de Saúde” e salve o arquivo (em Arquivos). Com o iPhone em português ele se chama exportar.zip; em inglês, export.zip — os dois servem.'),
        h('li', {}, 'Volte aqui e escolha o arquivo — exports grandes levam 1–2 minutos.'),
      ]),
      h('div', { class: 'exam-form-grid' }, [
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Importar período'), periodo]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Arquivo do export'), pickBtn]),
      ]),
      fileIn, track,
      h('p', { class: 'hint' }, S.health.lastImportAt
        ? 'Última importação: ' + new Date(S.health.lastImportAt).toLocaleString('pt-BR') + ' · ' + Object.keys(S.health.daily).length + ' dia(s) guardados. Reimportar atualiza os dias repetidos.'
        : 'Nenhuma importação ainda.'),
      h('p', { class: 'hint' }, 'Honestidade: energia e sono do relógio são ESTIMATIVAS do sensor. Em dias com iPhone + Watch juntos, o app usa a maior fonte (não soma as duas) para não contar em dobro.'),
    ]);
    return card;
  }

  function renderHealthStats(dates) {
    const ultimos = dates.slice(-30);
    const val = (k) => {
      const v = ultimos.map(d => S.health.daily[d][k]).filter(x => x != null);
      return v.length ? mediaDe(v) : null;
    };
    const sono = val('sleepMin');
    const grid = h('div', { class: 'results' }, [
      statBox('Passos', val('steps') != null ? Math.round(val('steps')) : null, 'por dia'),
      statBox('Ativa', val('kcalOut') != null ? Math.round(val('kcalOut')) : null, 'kcal/dia'),
      statBox('Exercício', val('exMin') != null ? Math.round(val('exMin')) : null, 'min/dia'),
      statBox('Sono', sono != null ? fmtDec(sono / 60, 1) : null, 'h/noite'),
      statBox('FC repouso', val('hrRest') != null ? Math.round(val('hrRest')) : null, 'bpm'),
      statBox('VO₂máx', val('vo2max') != null ? fmtDec(val('vo2max'), 1) : null, 'mL/kg·min'),
    ]);
    return h('div', { class: 'card' }, [
      h('h3', {}, '📊 Médias — últimos 30 dias com dados'),
      grid,
      h('p', { class: 'hint' }, 'Período: ' + fmtBR(ultimos[0]) + ' a ' + fmtBR(ultimos[ultimos.length - 1]) + '. Médias só dos dias em que a métrica existe.'),
    ]);
  }

  function movingAvg(series, dias) {
    return series.map(p => {
      const d0 = new Date(p.date + 'T12:00:00');
      const vals = series.filter(q => {
        const diff = (d0 - new Date(q.date + 'T12:00:00')) / 86400000;
        return diff >= 0 && diff < dias;
      }).map(q => q.value);
      return { date: p.date, value: Math.round(mediaDe(vals) * 100) / 100 };
    });
  }

  function renderHealthChart(dates) {
    const daily = S.health.daily;
    const disponiveis = Object.keys(METRIC_VIEW).filter(k => dates.some(d => daily[d][k] != null));
    if (!disponiveis.length) return h('div');
    if (disponiveis.indexOf(saudeMetric) === -1) saudeMetric = disponiveis[0];
    const mv = METRIC_VIEW[saudeMetric];
    const corte = saudePeriod === '0' ? null : shiftDate(isoLocal(new Date()), -Number(saudePeriod));
    const series = dates
      .filter(d => !corte || d >= corte)
      .map(d => ({ date: d, value: daily[d][saudeMetric] != null ? (mv.conv ? mv.conv(daily[d][saudeMetric]) : daily[d][saudeMetric]) : null }))
      .filter(p => p.value != null);
    const ma = series.length >= 7 ? movingAvg(series, 7) : null;
    return h('div', { class: 'card' }, [
      h('h3', {}, '📈 Métricas dia a dia'),
      h('div', { class: 'metric-controls' }, [
        h('select', { class: 'in', onchange: e => { saudeMetric = e.target.value; renderSaude(); } },
          disponiveis.map(k => h('option', { value: k, selected: k === saudeMetric ? 'selected' : null }, METRIC_VIEW[k].label))),
        h('select', { class: 'in', onchange: e => { saudePeriod = e.target.value; renderSaude(); } }, [
          ['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano'], ['0', 'tudo'],
        ].map(([v, t]) => h('option', { value: v, selected: v === saudePeriod ? 'selected' : null }, t))),
      ]),
      window.Charts.lineChart(series, {
        color: 'var(--accent)', unit: mv.unit, decimals: mv.dec,
        width: 1.5, lineOpacity: 0.4, pointR: 2.5,
        extra: ma ? [{ series: ma, color: 'var(--p)', width: 2.5 }] : [],
        empty: 'Sem dados neste período',
      }),
      ma ? h('p', { class: 'hint' }, 'Linha azul: média de 7 dias. Toque no gráfico para ver cada dia.') : null,
    ]);
  }

  function renderEnergyBalance() {
    const daily = S.health.daily;
    const kcalMap = dailyKcalMap();
    const overlap = Object.keys(daily)
      .filter(d => kcalMap[d] > 0 && daily[d].kcalOut != null && daily[d].kcalBasal != null)
      .sort().slice(-30);
    if (overlap.length < 7) return null;
    const inAvg = Math.round(mediaDe(overlap.map(d => kcalMap[d])));
    const outAvg = Math.round(mediaDe(overlap.map(d => daily[d].kcalOut + daily[d].kcalBasal)));
    const saldo = inAvg - outAvg;
    return h('div', { class: 'card' }, [
      h('h3', {}, '⚖️ Saldo energético — diário × relógio'),
      h('div', { class: 'results' }, [
        statBox('Ingerido', inAvg, 'kcal/dia (diário)'),
        statBox('Gasto', outAvg, 'kcal/dia (relógio)'),
        statBox('Saldo', (saldo > 0 ? '+' : '') + saldo, 'kcal/dia'),
      ]),
      h('p', { class: 'hint' }, 'Média dos últimos ' + overlap.length + ' dias com diário E relógio no mesmo dia. Gasto = energia basal + ativa estimadas pelo Watch — estimativa, não medida clínica. Saldo negativo ≈ déficit. Compare com o TDEE real da aba Perfil.'),
    ]);
  }

  // ================= ANÁLISE IA (exames × dieta × métricas) =================
  // Um botão: monta um RESUMO local dos seus dados e manda pro SEU proxy, que
  // consulta a IA e devolve uma leitura em texto puro. Guardamos a última
  // resposta p/ reler offline. NÃO é diagnóstico — é pauta p/ levar ao médico.
  function buildAnalysisPayload() {
    const hoje = isoLocal(new Date());
    const corte90 = shiftDate(hoje, -90);
    const porDia = Object.keys(S.days).filter(d => d >= corte90 && (S.days[d].items || []).length).sort().map(d => {
      const items = S.days[d].items || [];
      const tot = window.Nutrition.sumNutrients(items.map(itemNutrients).filter(n => n.hasKcal));
      return { kcal: Math.round(tot.kcal), prot: Math.round(tot.prot), carb: Math.round(tot.carb), fat: Math.round(tot.fat) };
    }).filter(x => x.kcal > 0);
    const eg = effectiveGoal();
    const dieta = {
      diasRegistradosUlt90d: porDia.length,
      mediaKcalDia: porDia.length ? Math.round(mediaDe(porDia.map(x => x.kcal))) : null,
      mediaProteinaGDia: porDia.length ? Math.round(mediaDe(porDia.map(x => x.prot))) : null,
      mediaCarboGDia: porDia.length ? Math.round(mediaDe(porDia.map(x => x.carb))) : null,
      mediaGorduraGDia: porDia.length ? Math.round(mediaDe(porDia.map(x => x.fat))) : null,
      metaKcalDia: eg.goalK || null,
      tdeeRealObservado: eg.adaptive && eg.adaptive.ok ? eg.adaptive.tdee : null,
    };
    const wDates = Object.keys(S.weights).sort();
    const peso = wDates.length ? {
      primeiraPesagem: { data: wDates[0], kg: S.weights[wDates[0]] },
      ultimaPesagem: { data: wDates[wDates.length - 1], kg: S.weights[wDates[wDates.length - 1]] },
      totalPesagens: wDates.length,
    } : null;
    const bcDates = Object.keys(S.bodyComp).sort();
    const bcLast = bcDates.length ? bcDates[bcDates.length - 1] : null;
    const composicao = bcLast ? {
      data: bcLast,
      gorduraPct: S.bodyComp[bcLast].fat != null ? S.bodyComp[bcLast].fat : null,
      massaMagraPct: S.bodyComp[bcLast].lean != null ? S.bodyComp[bcLast].lean : null,
    } : null;
    const byNorm = {};
    S.labExams.forEach(x => (byNorm[x.norm] = byNorm[x.norm] || []).push(x));
    const labs = Object.keys(byNorm).sort().map(k => {
      const rows = byNorm[k].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-6);
      const last = rows[rows.length - 1];
      return {
        exame: last.name,
        unidade: last.unit || null,
        resultados: rows.map(x => ({ data: x.date, valor: x.value, refMin: x.refLow, refMax: x.refHigh, obs: x.obs || undefined })),
      };
    });
    const imagem = S.imgExams.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12).map(x => ({
      data: x.date, exame: x.name, local: x.place || undefined,
      resumoLaudo: (x.report || '').slice(0, 500) || undefined,
    }));
    // Remédios: os em uso e os encerrados no último ano. Encerrado há dois
    // anos não explica exame de agora e só gastaria tokens; encerrado há três
    // meses explica, e muito.
    const corteMed = shiftDate(hoje, -365);
    const meds = (S.meds || [])
      .filter(m => !m.end || m.end >= corteMed)
      .sort((a, b) => ((a.start || '') < (b.start || '') ? 1 : -1))
      .map(m => ({
        nome: m.name,
        tipo: m.kind === 'suplemento' ? 'suplemento' : 'remédio',
        dose: m.dose || undefined,
        posologia: m.schedule || undefined,
        motivo: m.reason || undefined,
        desde: m.start || undefined,
        ate: m.end || undefined,
        situacao: m.end ? 'encerrado' : 'em uso',
        motivoDaParada: m.endReason || undefined,
        obs: m.obs || undefined,
      }));
    const hDates = Object.keys(S.health.daily || {}).sort();
    const ult30 = hDates.slice(-30).map(d => S.health.daily[d]);
    const met = k => {
      const v = ult30.map(x => x[k]).filter(x => x != null);
      return v.length ? Math.round(mediaDe(v) * 10) / 10 : null;
    };
    const metricas = hDates.length ? {
      diasComDados: hDates.length,
      periodo: { de: hDates[0], ate: hDates[hDates.length - 1] },
      medias30dMaisRecentes: {
        passosDia: met('steps'), kcalAtivasDia: met('kcalOut'), kcalBasaisDia: met('kcalBasal'),
        exercicioMinDia: met('exMin'), sonoMinNoite: met('sleepMin'), fcRepousoBpm: met('hrRest'),
        variabilidadeFcMs: met('hrv'), vo2max: met('vo2max'), distanciaKmDia: met('distKm'),
      },
    } : null;
    const p = S.profile;
    return {
      geradoEm: hoje,
      perfil: { sexo: p.sex === 'f' ? 'feminino' : 'masculino', idade: p.age, alturaCm: p.height, pesoAtualKg: p.weight, fatorAtividade: p.activity },
      dieta,
      peso,
      composicaoCorporal: composicao,
      examesLaboratoriais: labs,
      examesImagem: imagem,
      medicamentos: meds,
      metricasRelogio: metricas,
      lembretesVencidos: (S.examReminders || []).filter(r => reminderDue(r).days <= 0).map(r => r.name + ' (venceu em ' + fmtBR(reminderDue(r).due) + ')'),
    };
  }

  function renderAnalysisInto(box, a) {
    clear(box);
    box.appendChild(h('div', { class: 'analysis-text' }, a.text));
    box.appendChild(h('p', { class: 'hint' }, 'Gerado em ' + new Date(a.at).toLocaleString('pt-BR') + (a.modelo ? ' · modelo ' + a.modelo : '') + '. Não é diagnóstico — leve os pontos ao seu médico.'));
  }

  function openAnalysisModal() {
    if (!window.Auth.podeUsarProxy()) {
      toast('Para usar a análise, entre na sua conta (toque em “entrar”, no topo).', 'error');
      return;
    }
    const payload = buildAnalysisPayload();
    const resumo = payload.examesLaboratoriais.length + ' exame(s) de laboratório · '
      + payload.examesImagem.length + ' de imagem · '
      + payload.dieta.diasRegistradosUlt90d + ' dia(s) de diário (últimos 90) · '
      + (payload.metricasRelogio ? payload.metricasRelogio.diasComDados + ' dia(s) de métricas do relógio' : 'sem métricas do relógio');
    const out = h('div');
    const goBtn = h('button', { class: 'btn primary' }, '🔎 Analisar agora');
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      goBtn.textContent = '⏳ analisando (até ~1 min)…';
      clear(out);
      try {
        const res = await fetch(window.Auth.urlProxy('/analyze'), {
          method: 'POST',
          headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ dados: payload }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const e = new Error((data && (data.detail || data.error)) || 'HTTP ' + res.status);
          e.semChave = res.status === 402;
          throw e;
        }
        const nova = {
          id: 'a' + Date.now().toString(36),
          at: new Date().toISOString(),
          text: data.analise || '',
          modelo: data.modelo || '',
        };
        S.analyses.unshift(nova);   // mais recente primeiro; nada é sobrescrito
        window.Store.save();
        scheduleBackup();   // a análise também vai p/ a nuvem
        renderAnalysisInto(out, nova);
        renderExLab(); renderExImg(); renderSaude(); renderAnalises();
      } catch (err) {
        out.appendChild(h('p', { class: 'note', style: 'color:var(--danger)' }, 'Não consegui analisar: ' + err.message));
        if (err.semChave) {
          out.appendChild(h('button', { class: 'btn', onclick: () => { m.close(); goTo('diario', 'dados'); } }, '🔑 Cadastrar minha chave'));
        }
      }
      goBtn.disabled = false;
      goBtn.textContent = '🔎 Analisar agora';
    });
    const m = modal('Análise inteligente', h('div', {}, [
      h('p', { class: 'note' }, 'O app monta um resumo em números — ' + resumo + ' — e envia para o servidor, que consulta a IA com a SUA chave. Nomes, fotos e textos fora disso não vão junto.'),
      h('p', { class: 'hint' }, 'A resposta é apoio para conversar com médico/nutricionista, NÃO diagnóstico. Cada análise custa centavos na sua conta da Anthropic.'),
      h('div', { class: 'btn-row' }, [goBtn]),
      out,
    ]));
  }

  function renderAnalysisCard() {
    return h('div', { class: 'card' }, [
      h('h3', {}, '🔎 Análise inteligente'),
      h('p', { class: 'note' }, 'Um botão: a IA cruza exames, dieta registrada, peso/composição e métricas do relógio, e devolve pontos de atenção para levar ao médico. Usa o seu proxy (Diário → Dados) — a chave da API nunca fica no app.'),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn primary', onclick: openAnalysisModal }, '🔎 Analisar meus dados'),
        S.analyses.length ? h('button', {
          class: 'btn',
          onclick: () => goTo('ia', 'analises'),
        }, '📄 Ver análises (' + S.analyses.length + ')') : null,
      ]),
    ]);
  }


  // ================= ÁREA REMÉDIOS =================
  // O que a pessoa toma é contexto de LEITURA dos outros dados: um exame
  // alterado se lê diferente sabendo que ela começou uma medicação em março.
  // Por isso o que foi encerrado não some da lista — vira histórico com data
  // de fim, e é isso que explica uma virada no gráfico do exame.
  //
  // Nada aqui vira conselho: a IA recebe a lista como contexto e é proibida de
  // sugerir começar, parar ou mudar dose (REGRAS_HONESTIDADE, no Worker).
  let medEditando = null;   // id do remédio aberto para edição, ou null

  function medAtivo(m) { return !m.end; }

  function saveMeds() {
    window.Store.save();
    scheduleBackup();
    renderMeds();
  }

  function renderMeds() {
    const root = $('#tab-remedios');
    if (!root) return;
    clear(root);
    root.appendChild(renderMedForm());
    root.appendChild(renderMedList(true));
    const historico = renderMedList(false);
    if (historico) root.appendChild(historico);   // sem nada encerrado, o cartão não aparece
  }

  function renderMedForm() {
    const nameIn = h('input', { class: 'in', type: 'text', placeholder: 'ex.: Rosuvastatina' });
    const kindIn = h('select', { class: 'in' }, [
      h('option', { value: 'remedio' }, 'Remédio'),
      h('option', { value: 'suplemento' }, 'Suplemento'),
    ]);
    const doseIn = h('input', { class: 'in', type: 'text', placeholder: 'ex.: 10 mg' });
    const schedIn = h('input', { class: 'in', type: 'text', placeholder: 'ex.: 1x ao dia, à noite' });
    const reasonIn = h('input', { class: 'in', type: 'text', placeholder: 'opcional — ex.: colesterol' });
    const startIn = h('input', { class: 'in', type: 'date', value: isoLocal(new Date()) });
    const obsIn = h('textarea', { rows: '2', placeholder: 'opcional — quem receitou, como toma, o que sentiu…' });

    return h('div', { class: 'card' }, [
      h('h3', {}, '➕ Novo remédio ou suplemento'),
      h('p', { class: 'note' }, 'Serve para a análise ler seus exames sabendo o que você toma. '
        + 'O app não lembra de tomar, não confere interação e não dá conselho: '
        + 'quem ajusta dose é o seu médico.'),
      h('div', { class: 'exam-form-grid' }, [
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Nome'), nameIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Tipo'), kindIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Dose'), doseIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Como toma'), schedIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Para quê'), reasonIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Começou em'), startIn]),
        h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Observação'), obsIn]),
        h('div', { class: 'span2' }, h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameIn.value.trim();
            if (!name) { toast('Qual remédio? Preencha o nome.', 'error'); return; }
            S.meds.push({
              id: uid('m'), name, norm: window.Parser.normalize(name),
              kind: kindIn.value, dose: doseIn.value.trim(), schedule: schedIn.value.trim(),
              reason: reasonIn.value.trim(), start: startIn.value || isoLocal(new Date()),
              end: null, endReason: '', obs: obsIn.value.trim(),
            });
            saveMeds();
            toast(name + ' anotado ✅', 'ok');
          },
        }, '+ Adicionar')),
      ]),
    ]);
  }

  // ativos=true → "em uso"; false → o histórico do que foi encerrado
  function renderMedList(ativos) {
    const lista = S.meds.filter(m => medAtivo(m) === ativos)
      .sort((a, b) => ((a.start || '') < (b.start || '') ? 1 : -1));
    const card = h('div', { class: 'card' }, [
      h('h3', {}, ativos ? '💊 Em uso' : '📕 Encerrados'),
    ]);
    if (!ativos && !lista.length) return null;   // sem histórico, nem mostra o cartão
    if (!lista.length) {
      card.appendChild(h('p', { class: 'empty' }, 'Nada anotado ainda.'));
      return card;
    }
    if (!ativos) {
      card.appendChild(h('p', { class: 'note' }, 'Ficam guardados de propósito: '
        + 'uma mudança no exame muitas vezes se explica pelo que foi parado.'));
    }
    lista.forEach(m => card.appendChild(renderMedItem(m)));
    return card;
  }

  function renderMedItem(m) {
    const box = h('div', { class: 'med-item' + (medAtivo(m) ? '' : ' med-off') });
    if (medEditando === m.id) { montarEdicaoMed(box, m); return box; }

    const linha1 = [h('strong', {}, m.name)];
    if (m.dose) linha1.push(h('span', { class: 'med-dose' }, m.dose));
    if (m.kind === 'suplemento') linha1.push(h('span', { class: 'tag' }, 'suplemento'));
    box.appendChild(h('div', { class: 'med-head' }, linha1));

    const det = [];
    if (m.schedule) det.push(m.schedule);
    if (m.reason) det.push('para ' + m.reason);
    if (det.length) box.appendChild(h('p', { class: 'med-linha' }, det.join(' · ')));

    const periodo = medAtivo(m)
      ? 'Desde ' + fmtBR(m.start) + ' · ' + tempoDeUso(m.start)
      : 'De ' + fmtBR(m.start) + ' a ' + fmtBR(m.end) + (m.endReason ? ' · ' + m.endReason : '');
    box.appendChild(h('p', { class: 'hint' }, periodo));
    if (m.obs) box.appendChild(h('p', { class: 'med-linha' }, m.obs));

    const botoes = [h('button', { class: 'link-btn', onclick: () => { medEditando = m.id; renderMeds(); } }, '✏️ editar')];
    if (medAtivo(m)) {
      botoes.push(h('button', { class: 'link-btn', onclick: () => encerrarMed(m) }, '⏹ encerrar'));
    } else {
      botoes.push(h('button', {
        class: 'link-btn',
        onclick: () => { m.end = null; m.endReason = ''; saveMeds(); toast(m.name + ' voltou para “em uso”.', 'ok'); },
      }, '↩︎ voltei a tomar'));
    }
    botoes.push(h('button', {
      class: 'link-btn danger',
      onclick: () => {
        if (!confirm('Apagar ' + m.name + ' de vez?\n\nSe você só parou de tomar, use “encerrar”: '
          + 'assim ele vira histórico e continua explicando seus exames.')) return;
        S.meds = S.meds.filter(x => x.id !== m.id);
        saveMeds();
      },
    }, 'apagar'));
    box.appendChild(h('div', { class: 'btn-row' }, botoes));
    return box;
  }

  // "encerrar" pede a data real da parada: parar em março e anotar em julho é
  // o caso comum, e a data errada estragaria justamente o cruzamento com o exame
  function encerrarMed(m) {
    const dataIn = h('input', { class: 'in', type: 'date', value: isoLocal(new Date()), max: isoLocal(new Date()) });
    const porqueIn = h('input', { class: 'in', type: 'text', placeholder: 'opcional — ex.: médico suspendeu' });
    const mod = modal('Encerrar ' + m.name, h('div', {}, [
      h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Parou em'), dataIn]),
      h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Por quê'), porqueIn]),
      h('p', { class: 'hint' }, 'Ele sai de “em uso” e vira histórico — não é apagado.'),
      h('div', { class: 'btn-row' }, [h('button', {
        class: 'btn primary',
        onclick: () => {
          m.end = dataIn.value || isoLocal(new Date());
          m.endReason = porqueIn.value.trim();
          mod.close();
          saveMeds();
          toast(m.name + ' encerrado ✅', 'ok');
        },
      }, 'Encerrar')]),
    ]));
  }

  function montarEdicaoMed(box, m) {
    const campo = (rot, el) => h('div', { class: 'field' }, [h('label', { class: 'lbl' }, rot), el]);
    const nameIn = h('input', { class: 'in', type: 'text', value: m.name });
    const doseIn = h('input', { class: 'in', type: 'text', value: m.dose || '' });
    const schedIn = h('input', { class: 'in', type: 'text', value: m.schedule || '' });
    const reasonIn = h('input', { class: 'in', type: 'text', value: m.reason || '' });
    const startIn = h('input', { class: 'in', type: 'date', value: m.start || '' });
    const obsIn = h('textarea', { rows: '2' }, m.obs || '');
    box.appendChild(h('div', { class: 'exam-form-grid' }, [
      campo('Nome', nameIn), campo('Dose', doseIn),
      campo('Como toma', schedIn), campo('Para quê', reasonIn),
      campo('Começou em', startIn),
      h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Observação'), obsIn]),
    ]));
    box.appendChild(h('div', { class: 'btn-row' }, [
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const nome = nameIn.value.trim();
          if (!nome) { toast('O nome não pode ficar vazio.', 'error'); return; }
          m.name = nome; m.norm = window.Parser.normalize(nome);
          m.dose = doseIn.value.trim(); m.schedule = schedIn.value.trim();
          m.reason = reasonIn.value.trim(); m.start = startIn.value || m.start;
          m.obs = obsIn.value.trim();
          medEditando = null;
          saveMeds();
        },
      }, 'Salvar'),
      h('button', { class: 'btn', onclick: () => { medEditando = null; renderMeds(); } }, 'Cancelar'),
    ]));
  }

  function tempoDeUso(inicio) {
    const dias = Math.round((Date.parse(isoLocal(new Date())) - Date.parse(inicio)) / 86400000);
    if (!isFinite(dias) || dias < 0) return '';
    if (dias < 31) return 'há ' + dias + ' dia' + (dias === 1 ? '' : 's');
    const meses = Math.round(dias / 30.44);
    if (meses < 24) return 'há ' + meses + ' mês' + (meses === 1 ? '' : 'es');
    return 'há ' + (Math.round(dias / 365.25 * 10) / 10).toString().replace('.', ',') + ' anos';
  }

  // ================= ÁREA TREINO (coach semanal) =================
  // O coach monta UMA semana por vez no Worker (/treino) e evolui pelos números
  // que a pessoa registrou em cada item (campo `feito`). Fechar a semana manda
  // o plano + registros de volta e recebe notas 0-10 por capacidade, um plano
  // de melhoria e a próxima semana. Sem registro a nota vem null — o coach é
  // proibido de chutar, então registrar é o que faz a área funcionar.

  const TR_DIAS = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
  const TR_TIPOS = {
    forca: 'força', hipertrofia: 'hipertrofia', potencia: 'potência',
    equilibrio: 'equilíbrio', mobilidade: 'mobilidade', z2: 'zona 2', z5: 'zona 5',
    picoFc: 'pico de FC',
  };
  const TR_NOTAS = [
    ['forca', 'Força'], ['potencia', 'Potência'], ['equilibrio', 'Equilíbrio'],
    ['mobilidade', 'Mobilidade'], ['cardioZ2', 'Cardio Z2'], ['cardioZ5', 'Cardio Z5'],
  ];

  function saveTreino() {
    window.Store.save();
    scheduleBackup();
    renderTreino();
  }

  // A semana chega do Worker com id:null nos itens; o app dá identidade aqui.
  // O id não é usado para ligar o input ao registro (isso é closure sobre o
  // próprio objeto): serve para o item continuar reconhecível depois de virar
  // histórico — e por isso precisa ser único de verdade. `uid()` sozinho
  // repetiria dentro de um mesmo laço (mesmo milissegundo, 1296 sufixos), daí
  // o contador.
  //
  // `numero` é conferido AQUI também, e não só no Worker: o app (GitHub Pages)
  // e o Worker sobem separados, então um app novo pode conversar com um Worker
  // antigo. E numero é a IDENTIDADE da semana — o merge entre aparelhos casa
  // por ele, e um "semana 1" repetido faria o outro aparelho ser descartado em
  // silêncio. Por isso a contagem é sempre "maior semana já fechada + 1".
  function proximoNumeroDeSemana() {
    const fechadas = (S.treino.semanasFechadas || []).map(x => (x && x.numero) || 0);
    return (fechadas.length ? Math.max.apply(null, fechadas) : 0) + 1;
  }
  let seqItemTreino = 0;
  function adotarSemana(semana, numeroEsperado) {
    (semana.sessoes || []).forEach(s => (s.itens || []).forEach(it => {
      if (!it.id) it.id = uid('ti') + (++seqItemTreino).toString(36);
    }));
    if (numeroEsperado != null) semana.numero = numeroEsperado;
    return semana;
  }

  // corpo do POST /treino — exposto p/ testes (window.App.buildTreinoPayload)
  function buildTreinoPayload(acao) {
    const t = S.treino;
    const body = { acao, perfilTreino: t.perfil, dados: buildAnalysisPayload() };
    // Quando a meta calórica bateu no piso, o resto do déficit é trabalho do
    // treino: o coach recebe o número e sobe o cardio em vez de a pessoa
    // receber "coma menos" que ela já não pode cumprir.
    const p = analisarPlato();
    if (p && p.causa === 'meta_alta' && p.faltaPorTreino > 0) {
      body.gastoExtraAlvo = p.faltaPorTreino;
    }
    const historico = (t.avaliacoes || []).slice(0, 8)
      .map(a => ({ semana: a.semanaNumero, notas: a.notas }));
    if (acao === 'fechar') {
      body.semanaFechada = t.plano.semana;
      body.historicoNotas = historico;
    } else {
      // refazer o plano depois de semanas fechadas é CONTINUAR, não recomeçar:
      // vai o número em que a contagem segue e o que já foi avaliado, senão o
      // coach devolveria "semana 1" de novo e o histórico ganharia duas.
      body.proximaNumero = proximoNumeroDeSemana();
      if (historico.length) body.historicoNotas = historico;
    }
    return body;
  }

  async function chamarTreino(acao) {
    const res = await fetch(window.Auth.urlProxy('/treino'), {
      method: 'POST',
      headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildTreinoPayload(acao)),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error((data && (data.detail || data.error)) || 'HTTP ' + res.status);
      e.semChave = res.status === 402;
      throw e;
    }
    return data;
  }

  // aviso de erro com o atalho p/ cadastrar a chave quando o problema é esse
  function trErro(out, err, oQue) {
    clear(out);
    out.appendChild(h('p', { class: 'note', style: 'color:var(--danger)' }, 'Não consegui ' + oQue + ': ' + err.message));
    if (err.semChave) {
      out.appendChild(h('button', { class: 'btn', onclick: () => goTo('diario', 'dados') }, '🔑 Cadastrar minha chave'));
    }
  }

  function renderTreino() {
    renderTrSemana();
    renderTrEvolucao();
  }

  // ---- aba Semana ----
  function renderTrSemana() {
    const root = $('#tab-trsemana');
    if (!root) return;
    clear(root);
    const t = S.treino;
    if (!t.perfil) { root.appendChild(trFormPerfil(null)); return; }
    if (!t.plano) { root.appendChild(trCardMontar()); return; }
    trRenderSemanaCorrente(root);
  }

  // formulário de perfil de treino; `existente` preenchido = modo edição
  function trFormPerfil(existente) {
    const p = existente || {};
    const sel = (opcoes, atual) => {
      const s = h('select', { class: 'in' }, opcoes.map(([v, rot]) => h('option', { value: v }, rot)));
      if (atual != null) s.value = String(atual);
      return s;
    };
    const objetivoIn = sel([
      ['saude', 'Saúde e longevidade (geral)'],
      ['forca', 'Ganhar força'],
      ['massa', 'Ganhar massa muscular'],
      ['emagrecer', 'Emagrecer sem perder músculo'],
      ['folego', 'Fôlego e condicionamento'],
    ], p.objetivo);
    const diasIn = sel([['2', '2 dias'], ['3', '3 dias'], ['4', '4 dias'], ['5', '5 dias'], ['6', '6 dias']], p.diasSemana || '3');
    const minIn = sel([['30', 'até 30 min'], ['45', '~45 min'], ['60', '~1 hora'], ['90', '1h30 ou mais']], p.minutosPorSessao || '60');
    const localIn = sel([
      ['academia', 'Academia completa'],
      ['casa-pesos', 'Casa com halteres/elásticos'],
      ['casa-livre', 'Casa sem equipamento'],
    ], p.local);
    const expIn = sel([
      ['comecando', 'Começando agora'],
      ['retomando', 'Já treinei, estou retomando'],
      ['regular', 'Treino sem parar há mais de 1 ano'],
    ], p.experiencia);
    const limIn = h('textarea', { rows: '2', placeholder: 'opcional — ex.: dor no joelho direito; não posso correr' }, p.limitacoes || '');
    const rotinaIn = h('textarea', {
      rows: '4',
      placeholder: 'Ex.: trabalho das 8h às 18h, plantão às quartas. Academia fica no caminho do trabalho, '
        + 'só consigo ir de manhã cedo. Terça e quinta pego as crianças na escola e sobra pouco tempo. '
        + 'Sábado de manhã é o dia mais livre. Domingo prefiro descansar.',
    }, p.rotina || '');
    // Dias com academia: é O QUE decide onde cabe treino de força. Sem isso o
    // coach chuta, e chutar aqui é prescrever agachamento com barra no dia em
    // que a pessoa só tem a sala de casa.
    const DIAS_ORDEM = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']];
    const jaMarcados = Array.isArray(p.diasAcademia) ? p.diasAcademia : [];
    const diasChecks = DIAS_ORDEM.map(([id, rot]) => {
      const inp = h('input', { type: 'checkbox', id: 'acad-' + id });
      if (jaMarcados.includes(id)) inp.checked = true;
      return { id, el: h('label', { class: 'dia-check' }, [inp, ' ' + rot]), inp };
    });

    const lerPerfil = () => ({
      objetivo: objetivoIn.value,
      diasSemana: parseInt(diasIn.value, 10),
      minutosPorSessao: parseInt(minIn.value, 10),
      local: localIn.value,
      experiencia: expIn.value,
      limitacoes: limIn.value.trim(),
      rotina: rotinaIn.value.trim(),
      diasAcademia: diasChecks.filter(d => d.inp.checked).map(d => d.id),
    });

    const out = h('div');
    const goBtn = h('button', { class: 'btn primary' }, existente ? 'Salvar perfil' : '🏋️ Montar meu plano');
    goBtn.addEventListener('click', async () => {
      S.treino.perfil = lerPerfil();
      window.Store.save();
      scheduleBackup();
      if (existente) { renderTreino(); toast('Perfil de treino atualizado ✅', 'ok'); return; }
      await trMontarPlano(goBtn, out);
    });

    return h('div', { class: 'card' }, [
      h('h3', {}, existente ? '✏️ Ajustar perfil de treino' : '🏋️ Coach de treino'),
      existente ? h('p', { class: 'note' }, 'Vale a partir da próxima semana que o coach montar.')
        : h('p', { class: 'note' }, 'Um plano semanal que cobre força, potência (fibras rápidas), equilíbrio, '
          + 'mobilidade, cardio em zona 2 e zona 5, e um pico curto de frequência cardíaca todo dia — '
          + 'nas doses dos protocolos de Huberman, Andy Galpin e Jeff Nippard. '
          + 'Você registra carga, minutos e bpm; o coach dá nota por capacidade e evolui a semana seguinte pelos seus números.'),
      h('div', { class: 'exam-form-grid' }, [
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Objetivo principal'), objetivoIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Dias por semana'), diasIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Tempo por sessão'), minIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Onde treina'), localIn]),
        h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Experiência'), expIn]),
        h('div', { class: 'field span2' }, [h('label', { class: 'lbl' }, 'Dores ou limitações'), limIn]),
        h('div', { class: 'field span2' }, [
          h('label', { class: 'lbl' }, 'Em quais dias você tem academia?'),
          h('div', { class: 'dias-row' }, diasChecks.map(d => d.el)),
          h('p', { class: 'hint' }, 'O treino de força vai nesses dias. Nos outros, o coach monta o que dá para fazer sem equipamento — cardio, mobilidade, equilíbrio.'),
        ]),
        h('div', { class: 'field span2' }, [
          h('label', { class: 'lbl' }, 'Como é a sua rotina?'),
          rotinaIn,
          h('p', { class: 'hint' }, 'Escreva do seu jeito: horário de trabalho, que dias são corridos, quando dá para treinar, o que costuma atrapalhar. Quanto mais concreto, melhor o coach encaixa o treino na sua semana de verdade.'),
        ]),
        h('div', { class: 'span2' }, goBtn),
      ]),
      existente ? null : h('p', { class: 'hint' }, 'O coach lê também o que você já tem no app — dieta, peso, exames, '
        + 'remédios e métricas do relógio — e usa isso de verdade: proteína baixa limita ganho de força, '
        + 'exame alterado muda a expectativa, FC de repouso subindo antecipa o deload. Não é prescrição médica: '
        + 'com dor no peito, tontura ou lesão, pare e procure seu médico.'),
      out,
    ]);
  }

  // perfil existe mas o plano não (primeira chamada falhou ou plano refeito)
  function trCardMontar() {
    const out = h('div');
    const goBtn = h('button', { class: 'btn primary' }, '🏋️ Montar meu plano');
    goBtn.addEventListener('click', () => trMontarPlano(goBtn, out));
    return h('div', { class: 'card' }, [
      h('h3', {}, '🏋️ Coach de treino'),
      h('p', { class: 'note' }, 'Perfil pronto. Falta o coach montar a primeira semana — leva até um minuto.'),
      h('div', { class: 'btn-row' }, [
        goBtn,
        h('button', { class: 'btn', onclick: () => { S.treino.perfil = null; saveTreino(); } }, '✏️ Refazer o perfil'),
      ]),
      out,
    ]);
  }

  async function trMontarPlano(goBtn, out) {
    if (!window.Auth.podeUsarProxy()) {
      toast('Para usar o coach, entre na sua conta (toque em “entrar”, no topo).', 'error');
      return;
    }
    goBtn.disabled = true;
    const rotulo = goBtn.textContent;
    goBtn.textContent = '⏳ montando o plano (até ~1 min)…';
    clear(out);
    try {
      const numero = proximoNumeroDeSemana();
      const data = await chamarTreino('plano');
      S.treino.plano = {
        criadoEm: new Date().toISOString(),
        apresentacao: data.apresentacao || '',
        modelo: data.modelo || '',
        semana: adotarSemana(data.semana, numero),
      };
      saveTreino();
      toast('Plano montado ✅ — semana ' + numero + ' na tela.', 'ok');
      return;
    } catch (err) {
      trErro(out, err, 'montar o plano');
    }
    goBtn.disabled = false;
    goBtn.textContent = rotulo;
  }

  function trRenderSemanaCorrente(root) {
    const t = S.treino;
    const sem = t.plano.semana;

    const head = h('div', { class: 'card' }, [
      h('div', { class: 'conta-linha' }, [
        h('h3', {}, '📋 Semana ' + sem.numero),
        h('span', { class: 'tr-bloco' }, sem.bloco + ' · sem. ' + sem.semanaDoBloco + ' de ' + sem.semanasNoBloco),
      ]),
      sem.foco ? h('p', { class: 'med-linha' }, h('strong', {}, sem.foco)) : null,
      sem.orientacoes ? h('p', { class: 'note tr-aval-texto' }, sem.orientacoes) : null,
      (sem.numero === 1 && t.plano.apresentacao)
        ? h('p', { class: 'hint tr-aval-texto' }, t.plano.apresentacao) : null,
    ]);
    root.appendChild(head);

    (sem.sessoes || []).forEach(s => root.appendChild(trCardSessao(s)));

    // fechar a semana = o momento em que os registros viram nota e progressão
    const out = h('div');
    const fecharBtn = h('button', { class: 'btn primary' }, '✅ Fechar a semana com o coach');
    fecharBtn.addEventListener('click', () => trFecharSemana(fecharBtn, out));
    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, '🏁 Fechou os treinos?'),
      h('p', { class: 'note' }, 'Registre carga e minutos nos itens acima ao longo da semana. Ao fechar, o coach '
        + 'avalia os números, dá uma nota por capacidade e já monta a semana ' + (sem.numero + 1) + '. '
        + 'Capacidade sem registro fica sem nota — ele não chuta.'),
      h('div', { class: 'btn-row' }, [fecharBtn]),
      out,
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'link-btn', onclick: () => { renderTrPerfilModal(); },
        }, '✏️ ajustar perfil'),
        h('button', {
          class: 'link-btn danger',
          onclick: () => {
            if (!confirm('Refazer o plano do zero?\n\nA semana atual (e o que foi registrado nela) é descartada. '
              + 'As semanas já fechadas e as notas ficam guardadas.')) return;
            S.treino.plano = null;
            saveTreino();
          },
        }, '↻ refazer o plano'),
      ]),
    ]));
  }

  function renderTrPerfilModal() {
    const form = trFormPerfil(S.treino.perfil || {});
    const m = modal('Perfil de treino', form);
    // no modal, salvar também fecha a janela
    form.querySelector('.btn.primary').addEventListener('click', () => m.close());
  }

  function trCardSessao(sessao) {
    const card = h('div', { class: 'card tr-sessao-card' });
    card.appendChild(h('div', { class: 'tr-sessao-head' }, [
      h('span', { class: 'tr-dia' }, TR_DIAS[sessao.dia] || sessao.dia),
      h('strong', {}, sessao.titulo),
      h('span', { class: 'tr-tipo tr-tipo-' + sessao.tipo }, TR_TIPOS[sessao.tipo] || sessao.tipo),
      h('span', { class: 'hint' }, '~' + sessao.duracaoMin + ' min'),
    ]));
    (sessao.itens || []).forEach(it => card.appendChild(trItemRow(it)));
    return card;
  }

  // Uma linha por exercício: alvo prescrito + campos de registro. Os inputs
  // NÃO redesenham a tela ao digitar (perderia o foco no meio do número) —
  // só gravam no estado e acendem a borda de "registrado".
  function trItemRow(item) {
    const row = h('div', { class: 'tr-item' + (item.feito ? ' tr-ok' : '') });
    // partes montadas só com o que existe: séries sem reps (ou nenhuma das
    // duas, que o schema permite) deixava " · 20 kg" com separador órfão
    // 'fc' = pico diário de frequência cardíaca: o alvo é o esforço/duração,
    // e o que a pessoa anota depois é o bpm que o relógio marcou
    const alvo = item.registro === 'fc'
      ? [[item.series, item.reps].filter(x => x != null).join(' × '), item.cargaSugerida]
        .filter(Boolean).join(' · ')
      : item.registro === 'tempo'
        ? (item.minutos != null ? item.minutos + ' min' : 'tempo livre')
        : [[item.series, item.reps].filter(x => x != null).join(' × '), item.cargaSugerida]
          .filter(Boolean).join(' · ');
    row.appendChild(h('div', {}, [
      h('span', { class: 'tr-item-nome' }, h('strong', {}, item.nome)),
      ' ',
      h('span', { class: 'tr-alvo' }, alvo ? 'alvo: ' + alvo : ''),
    ]));
    if (item.detalhe) row.appendChild(h('p', { class: 'hint', style: 'margin:2px 0' }, item.detalhe));

    const f = item.feito || {};
    const num = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const grava = (campo) => (e) => {
      const feito = item.feito || {};
      feito[campo] = num(e.target.value);
      // registro só existe se algum campo tem número — vazio de novo = apaga,
      // e para o Worker "sem feito" é literalmente "não registrado"
      const temAlgo = Object.keys(feito).some(k => feito[k] != null);
      if (temAlgo) item.feito = feito; else delete item.feito;
      row.classList.toggle('tr-ok', !!item.feito);
      window.Store.save();
      scheduleBackup();
    };
    // type=text + inputmode=decimal (e não type=number): o teclado pt-BR
    // digita "42,5" e o input numérico do navegador descarta a vírgula em
    // silêncio — o registro sumiria. num() aceita vírgula e ponto.
    // oninput (e não onchange): change só dispara ao SAIR do campo, e quem
    // digita o último número e fecha o app perderia justamente esse registro.
    const inp = (campo, ph) => h('input', {
      class: 'tr-in', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      value: f[campo] != null ? String(f[campo]).replace('.', ',') : '', placeholder: ph, oninput: grava(campo),
    });
    const rpeSel = h('select', { class: 'tr-in tr-in-rpe', onchange: grava('rpe') },
      [h('option', { value: '' }, 'RPE')].concat([5, 6, 7, 8, 9, 10].map(n => h('option', { value: String(n) }, 'RPE ' + n))));
    if (f.rpe != null) rpeSel.value = String(f.rpe);

    // sem separador ANTES do RPE: a linha quebra no celular e o "·" ficava
    // órfão no fim da linha, parecendo erro de digitação
    const reg = h('div', { class: 'tr-reg' });
    if (item.registro === 'fc') {
      // o pico do dia se mede pelo que o relógio marcou; sem relógio, o RPE
      // ao lado é o registro possível (a base manda usar RPE 9-10 no lugar)
      reg.appendChild(h('span', { class: 'lblzin' }, 'pico'));
      reg.appendChild(inp('fcPico', 'bpm'));
      reg.appendChild(h('span', { class: 'lblzin' }, 'bpm'));
    } else if (item.registro === 'tempo') {
      reg.appendChild(h('span', { class: 'lblzin' }, 'fiz'));
      reg.appendChild(inp('minutos', 'min'));
      reg.appendChild(h('span', { class: 'lblzin' }, 'min'));
    } else {
      reg.appendChild(inp('carga', 'kg'));
      reg.appendChild(h('span', { class: 'lblzin' }, 'kg ×'));
      reg.appendChild(inp('series', 'sér.'));
      reg.appendChild(h('span', { class: 'lblzin' }, '×'));
      reg.appendChild(inp('reps', 'reps'));
    }
    reg.appendChild(rpeSel);
    row.appendChild(reg);
    return row;
  }

  async function trFecharSemana(fecharBtn, out) {
    if (!window.Auth.podeUsarProxy()) {
      toast('Para usar o coach, entre na sua conta (toque em “entrar”, no topo).', 'error');
      return;
    }
    const sem = S.treino.plano.semana;
    const itens = (sem.sessoes || []).flatMap(s => s.itens || []);
    const registrados = itens.filter(i => i.feito).length;
    if (!confirm('Fechar a semana ' + sem.numero + '?\n\n'
      + registrados + ' de ' + itens.length + ' itens com registro. '
      + (registrados ? 'O que não foi registrado fica sem nota.' : 'Sem nenhum registro, o coach não tem como dar nota — dá para fechar assim mesmo, mas as notas virão vazias.'))) return;
    fecharBtn.disabled = true;
    fecharBtn.textContent = '⏳ avaliando a semana (até ~1 min)…';
    clear(out);
    try {
      const data = await chamarTreino('fechar');
      // O usuário pode ter refeito o plano durante o ~1 min da chamada. Gravar
      // agora criaria uma avaliação de um plano que ele já descartou (e a
      // atribuição da próxima semana estouraria num plano nulo).
      if (!S.treino.plano || S.treino.plano.semana !== sem) {
        toast('O plano mudou enquanto o coach avaliava — a avaliação desta semana foi descartada.', 'error');
        renderTreino();
        return;
      }
      S.treino.semanasFechadas.push(Object.assign({}, sem, { fechadaEm: new Date().toISOString() }));
      S.treino.avaliacoes.unshift({
        id: uid('av'),
        at: new Date().toISOString(),
        semanaNumero: sem.numero,
        notas: data.notas,
        texto: data.avaliacao || '',
        melhorias: data.melhorias || [],
        modelo: data.modelo || '',
      });
      S.treino.plano.semana = adotarSemana(data.proximaSemana, proximoNumeroDeSemana());
      window.Store.save();
      scheduleBackup();
      toast('Semana ' + sem.numero + ' avaliada ✅ — notas na aba Evolução.', 'ok');
      goTo('treino', 'trevolucao');
      renderTreino();
      return;
    } catch (err) {
      trErro(out, err, 'fechar a semana');
    }
    fecharBtn.disabled = false;
    fecharBtn.textContent = '✅ Fechar a semana com o coach';
  }

  // ---- aba Evolução: notas por capacidade + plano de melhoria ----
  function renderTrEvolucao() {
    const root = $('#tab-trevolucao');
    if (!root) return;
    clear(root);
    const avals = S.treino.avaliacoes || [];
    if (!avals.length) {
      root.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, '📈 Evolução'),
        h('p', { class: 'note' }, S.treino.plano
          ? 'As notas aparecem aqui quando você fechar a primeira semana (aba Semana). Cada fechamento avalia força, potência, equilíbrio, mobilidade e cardio pelos números que você registrou.'
          : 'Monte seu plano na aba Semana. Depois de fechar a primeira semana, suas notas por capacidade aparecem aqui.'),
      ]));
      return;
    }
    root.appendChild(trCardAvaliacao(avals[0], true));
    if (avals.length > 1) {
      const antCard = h('div', { class: 'card' }, [h('h3', {}, '🗂 Semanas anteriores')]);
      avals.slice(1).forEach(a => antCard.appendChild(trAvaliacaoResumo(a)));
      root.appendChild(antCard);
    }
  }

  function trCardAvaliacao(a, atual) {
    const card = h('div', { class: 'card' }, [
      h('h3', {}, (atual ? '📈 Notas da semana ' : 'Semana ') + a.semanaNumero),
      h('p', { class: 'hint' }, 'Fechada em ' + new Date(a.at).toLocaleDateString('pt-BR')
        + (a.modelo ? ' · avaliada por ' + a.modelo : '')),
    ]);
    TR_NOTAS.forEach(([k, rot]) => {
      const v = a.notas ? a.notas[k] : null;
      card.appendChild(h('div', { class: 'nota-row' }, [
        h('span', { class: 'nota-nome' }, rot),
        h('div', { class: 'nota-track' }, v != null
          ? h('div', { class: 'nota-fill' + (v <= 5 ? ' baixa' : ''), style: 'width:' + (v * 10) + '%' }) : null),
        v != null
          ? h('span', { class: 'nota-val' }, String(v).replace('.', ','))
          : h('span', { class: 'nota-val semdado' }, 'sem registro'),
      ]));
    });
    if (a.texto) card.appendChild(h('p', { class: 'tr-aval-texto' }, a.texto));
    if (a.melhorias && a.melhorias.length) {
      card.appendChild(h('h3', { style: 'margin-top:12px' }, '🎯 Plano de melhoria'));
      a.melhorias.forEach((mm, i) => card.appendChild(h('p', { class: 'tr-melhoria' }, (i + 1) + '. ' + mm)));
    }
    card.appendChild(h('p', { class: 'hint' }, 'Notas são relativas a VOCÊ e aos seus registros — não a atleta. Não é avaliação médica.'));
    return card;
  }

  // resumo compacto de uma avaliação antiga; "Ler" abre o cartão completo
  // abreviação própria: cortar no espaço transformava "Cardio Z2" e "Cardio Z5"
  // nos dois em "Cardio", e a linha ficava com duas notas sem dizer de quê
  const TR_ABREV = { forca: 'Força', potencia: 'Potência', equilibrio: 'Equilíbrio', mobilidade: 'Mobilidade', cardioZ2: 'Z2', cardioZ5: 'Z5' };
  function trAvaliacaoResumo(a) {
    const linha = TR_NOTAS
      .map(([k]) => (a.notas && a.notas[k] != null) ? TR_ABREV[k] + ' ' + String(a.notas[k]).replace('.', ',') : null)
      .filter(Boolean).join(' · ') || 'sem notas';
    return h('div', { class: 'med-item' }, [
      h('div', { class: 'med-head' }, [
        h('strong', {}, 'Semana ' + a.semanaNumero),
        h('span', { class: 'hint' }, new Date(a.at).toLocaleDateString('pt-BR')),
      ]),
      h('p', { class: 'med-linha' }, linha),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'link-btn', onclick: () => modal('Avaliação — semana ' + a.semanaNumero, trCardAvaliacao(a, false)) }, 'Ler'),
      ]),
    ]);
  }

  // ================= ÁREA IA (conversa + análises guardadas) =================
  // A análise responde "como estou no geral?" de uma vez só. A conversa
  // responde "e sobre o colesterol?" — pontual, e emendando na resposta
  // anterior. Por isso são duas abas e duas rotas diferentes no proxy.

  // ---- aba Análises: tudo que já foi gerado, do mais novo p/ o mais velho ----
  function renderAnalises() {
    const el = $('#tab-analises');
    if (!el) return;
    clear(el);

    el.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, '📄 Análises guardadas'),
      h('p', { class: 'note' }, 'Cada análise cruza exames, dieta, peso e métricas no momento em que foi gerada — por isso vale guardar: dá para comparar o que mudou entre uma e outra.'),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn primary', onclick: openAnalysisModal }, '🔎 Nova análise'),
      ]),
    ]));

    el.appendChild(renderOpenBrainCard());

    if (!S.analyses.length) {
      el.appendChild(h('p', { class: 'hint' }, 'Nenhuma análise ainda. A primeira leva cerca de um minuto.'));
      return;
    }

    S.analyses.forEach((a) => {
      const corpo = h('div', { hidden: true });
      let aberto = false;
      const verBtn = h('button', { class: 'btn' }, 'Ler');
      verBtn.addEventListener('click', () => {
        aberto = !aberto;
        corpo.hidden = !aberto;
        verBtn.textContent = aberto ? 'Recolher' : 'Ler';
        if (aberto && !corpo.firstChild) renderAnalysisInto(corpo, a);
      });
      el.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, new Date(a.at).toLocaleString('pt-BR')),
        h('p', { class: 'hint' }, (a.modelo ? 'modelo ' + a.modelo + ' · ' : '')
          + Math.max(1, Math.round(a.text.length / 900)) + ' min de leitura'),
        h('div', { class: 'btn-row' }, [
          verBtn,
          h('button', {
            class: 'link-btn danger',
            onclick: () => {
              if (!confirm('Apagar esta análise de ' + new Date(a.at).toLocaleDateString('pt-BR') + '?')) return;
              S.analyses = S.analyses.filter(x => x !== a);
              window.Store.save(); scheduleBackup();
              renderAnalises(); renderExLab(); renderExImg(); renderSaude();
            },
          }, 'apagar'),
        ]),
        corpo,
      ]));
    });
  }

  // ---- envio de contexto para o Open Brain (opcional, por conta) ----
  // Fica DESLIGADO por padrão: manda dados de saúde para fora do Highlander,
  // de forma permanente (o Open Brain não tem apagar). Ligar é decisão
  // consciente, não padrão herdado.
  function renderOpenBrainCard() {
    const card = h('div', { class: 'card' }, [h('h3', {}, '🧠 Enviar contexto para o Open Brain')]);
    // Escondido até o servidor dizer se esta conta pode. Mostrar primeiro e
    // remover depois faria o cartão piscar na tela de quem nunca vai poder
    // usá-lo — pior do que nunca ter aparecido.
    card.hidden = true;
    if (!window.Auth.logado()) {
      card.hidden = false;
      card.appendChild(h('p', { class: 'note' }, 'Entre na sua conta para configurar o envio.'));
      return card;
    }
    card.appendChild(h('p', { class: 'note' }, 'Manda para o seu Open Brain um retrato semanal (médias de dieta, peso, composição corporal e métricas) e cada resultado de exame laboratorial novo, com a faixa de referência do seu laudo. Assim outras IAs suas encontram esse contexto depois.'));
    card.appendChild(h('p', { class: 'hint' }, 'NÃO sobe: foto, laudo em texto livre, exame de imagem, o texto das análises, a conversa desta área, nem o diário item a item — só números agregados e resultados de exame.'));

    const estado = h('p', { class: 'hint' }, 'Verificando…');
    const acoes = h('div', { class: 'btn-row' });
    card.appendChild(estado);
    card.appendChild(acoes);
    const msg = h('p', { class: 'auth-msg' });
    card.appendChild(msg);

    const pintar = (st) => {
      // espelho local só para saber se vale disparar o envio ao registrar um
      // exame; quem manda de verdade é o servidor (é ele que tem o livro-caixa)
      if (S.settings.openBrain !== !!st.ativo) { S.settings.openBrain = !!st.ativo; window.Store.save(); }
      clear(acoes);
      // A chave do Open Brain é UMA, de quem hospeda o app: se todo mundo
      // pudesse ligar, os dados de saúde de todos cairiam no brain dele. O
      // servidor decide quem pode; para os demais o cartão some inteiro em vez
      // de oferecer um botão que responderia 403.
      if (st.permitido === false) { card.remove(); return; }
      card.hidden = false;
      if (!st.configurado) {
        estado.className = 'hint comp-warn';
        estado.textContent = '⚠ Quem administra o app ainda não cadastrou a chave do Open Brain no servidor.';
        return;
      }
      estado.className = 'hint';
      estado.textContent = st.ativo
        ? '✅ Ligado · ' + st.examesEnviados + ' exame(s) já enviados'
          + (st.ultimoRetratoEm ? ' · último retrato em ' + fmtBR(st.ultimoRetratoEm) : ' · retrato ainda não enviado')
        : 'Desligado — nada é enviado.';
      const acao = async (corpo, texto) => {
        msg.className = 'auth-msg'; msg.textContent = '⏳ ' + texto;
        try {
          const r = await fetch(window.Auth.urlProxy('/openbrain/sync'), {
            method: 'POST',
            headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(corpo),
          });
          const d = await r.json().catch(() => null);
          if (!r.ok) throw new Error((d && (d.detail || d.error)) || 'HTTP ' + r.status);
          msg.className = 'auth-msg ok';
          msg.textContent = d && d.enviados
            ? (d.enviados.length ? '✅ Enviado: ' + d.enviados.length + ' item(ns).' : '✅ Nada novo para enviar.')
            : '✅ Pronto.';
          if (d && d.falhas && d.falhas.length) {
            msg.className = 'auth-msg erro';
            msg.textContent = '⚠ ' + d.falhas[0];
          }
          pintar(await (await fetch(window.Auth.urlProxy('/openbrain/sync'), {
            method: 'GET', headers: window.Auth.cabecalhosProxy(),
          })).json());
        } catch (e) {
          msg.className = 'auth-msg erro'; msg.textContent = '⚠ ' + e.message;
        }
      };
      if (st.ativo) {
        acoes.appendChild(h('button', { class: 'btn', onclick: () => acao({ forcarRetrato: true }, 'enviando…') }, 'Enviar agora'));
        acoes.appendChild(h('button', {
          class: 'btn danger',
          onclick: () => { if (confirm('Parar de enviar para o Open Brain?\n\nO que já foi enviado continua lá — o Open Brain não tem como apagar.')) acao({ desativar: true }, 'desligando…'); },
        }, 'Desligar'));
      } else {
        acoes.appendChild(h('button', {
          class: 'btn primary',
          onclick: () => {
            if (!confirm('Ligar o envio para o Open Brain?\n\nSeus números de saúde e resultados de exame passam a ser copiados para lá. Isso é PERMANENTE: o Open Brain não permite apagar depois.')) return;
            acao({ ativar: true }, 'ligando e enviando o que já existe…');
          },
        }, 'Ligar envio'));
      }
    };

    fetch(window.Auth.urlProxy('/openbrain/sync'), { method: 'GET', headers: window.Auth.cabecalhosProxy() })
      .then(r => r.json()).then(pintar)
      .catch(() => {
        // sem resposta não dá para saber se esta conta pode; mostra o aviso em
        // vez de sumir calado — quem não puder ainda esbarra no 403 ao tentar
        card.hidden = false;
        estado.className = 'hint comp-warn';
        estado.textContent = '⚠ Não consegui falar com o servidor agora.';
      });
    return card;
  }

  // ---- aba Conversa: perguntas pontuais, com o fio da conversa preservado ----
  let chatEnviando = false;
  function renderConversa() {
    const el = $('#tab-conversa');
    if (!el) return;
    clear(el);

    const msgs = S.chat.mensagens;
    const card = h('div', { class: 'card' }, [
      h('h3', {}, '💬 Perguntar sobre meus dados'),
      h('p', { class: 'note' }, 'Pergunte o que quiser sobre a sua saúde e nutrição. A IA recebe o mesmo resumo em números da análise — dieta, peso, exames e métricas — e lembra do que já foi dito nesta conversa.'),
    ]);
    el.appendChild(card);

    const fio = h('div', { class: 'chat-fio' });
    if (!msgs.length) {
      fio.appendChild(h('p', { class: 'hint' }, 'Nenhuma pergunta ainda. Alguns exemplos: “minha proteína está suficiente para o meu peso?”, “o que mudou nos meus exames no último ano?”, “meu sono está atrapalhando o gasto calórico?”'));
    }
    msgs.forEach((m) => {
      fio.appendChild(h('div', { class: 'chat-msg ' + (m.role === 'user' ? 'eu' : 'ia') }, [
        h('div', { class: 'chat-bolha' }, m.text),
      ]));
    });
    card.appendChild(fio);

    const campo = h('textarea', {
      class: 'in chat-campo', rows: 3,
      placeholder: 'Escreva sua pergunta…',
      disabled: chatEnviando ? 'disabled' : null,
    });
    const enviar = h('button', { class: 'btn primary', disabled: chatEnviando ? 'disabled' : null },
      chatEnviando ? '⏳ pensando…' : 'Perguntar');
    const aviso = h('p', { class: 'auth-msg' });

    async function perguntar() {
      const texto = campo.value.trim();
      if (!texto || chatEnviando) return;
      if (!window.Auth.podeUsarProxy()) {
        toast('Para conversar, entre na sua conta (toque em “entrar”, no topo).', 'error');
        return;
      }
      // grava a pergunta ANTES de enviar: se a resposta falhar, o que você
      // escreveu não se perde junto
      S.chat.mensagens.push({ role: 'user', text: texto, at: new Date().toISOString() });
      window.Store.save();
      chatEnviando = true;
      renderConversa();
      try {
        const res = await fetch(window.Auth.urlProxy('/chat'), {
          method: 'POST',
          headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            dados: buildAnalysisPayload(),
            mensagens: S.chat.mensagens.map(m => ({ role: m.role, text: m.text })),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const e = new Error((data && (data.detail || data.error)) || 'HTTP ' + res.status);
          e.semChave = res.status === 402;
          throw e;
        }
        S.chat.mensagens.push({
          role: 'assistant', text: data.resposta || '', at: new Date().toISOString(), modelo: data.modelo || '',
        });
        window.Store.save();
        scheduleBackup();
        chatEnviando = false;
        renderConversa();
      } catch (err) {
        chatEnviando = false;
        renderConversa();
        const box = $('#tab-conversa .auth-msg');
        if (box) {
          box.className = 'auth-msg erro';
          box.textContent = '⚠ ' + err.message
            + (err.semChave ? ' Cadastre sua chave em Diário → Dados.' : '');
        }
      }
    }
    enviar.addEventListener('click', perguntar);
    // Enter envia, Shift+Enter quebra linha (no celular o teclado dá a quebra)
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); perguntar(); }
    });

    card.appendChild(campo);
    card.appendChild(h('div', { class: 'btn-row' }, [
      enviar,
      msgs.length ? h('button', {
        class: 'btn',
        onclick: () => {
          if (!confirm('Começar uma conversa nova? As perguntas e respostas atuais serão apagadas.')) return;
          S.chat.mensagens = [];
          window.Store.save(); scheduleBackup();
          renderConversa();
        },
      }, 'Nova conversa') : null,
    ]));
    card.appendChild(aviso);
    card.appendChild(h('p', { class: 'hint' }, 'Não é diagnóstico. A IA responde com base no que VOCÊ registrou — se faltar dado, ela diz o que falta em vez de chutar. Cada pergunta custa centavos na sua conta da Anthropic.'));

    if (chatEnviando) setTimeout(() => { const f = $('#tab-conversa .chat-fio'); if (f) f.scrollTop = f.scrollHeight; }, 0);
  }

  // ================= CONTA (login por e-mail) =================
  // Uma conta resolve o que a senha do proxy não resolvia: entrar num aparelho
  // novo e ter tudo de volta, e recuperar acesso por e-mail se esquecer a
  // senha. Enquanto não há login, o app funciona 100% offline como sempre.

  function contaInfo() { return window.Auth.conta(); }

  // chip no topo: em quem estou logado (ou convite p/ entrar)
  function atualizarStatusConta() {
    const chip = $('#conta-chip');
    if (!chip) return;
    chip.hidden = false;
    if (window.Auth.logado()) {
      const pend = window.Auth.temPendencia();
      chip.className = 'conta-chip on';
      chip.textContent = (pend ? '↻ ' : '☁ ') + window.Auth.email();
      chip.title = pend
        ? 'Alterações ainda não enviadas para a nuvem — toque para ver a conta.'
        : 'Sincronizado com a nuvem. Toque para ver a conta.';
    } else {
      chip.className = 'conta-chip off';
      chip.textContent = 'entrar';
      chip.title = 'Entrar para guardar seus dados na nuvem e não perder nada.';
    }
    chip.onclick = () => { if (window.Auth.logado()) goTo('diario', 'dados'); else abrirLogin(); };
  }

  // ---- decide o que fazer quando a nuvem e o aparelho têm dados ----
  // Serve para decidir se a nuvem pode SOBRESCREVER este aparelho sem
  // perguntar. Tudo que a pessoa produziu e não quer perder precisa contar
  // aqui — análises e conversa inclusive: quem só tivesse essas duas coisas
  // (nenhum dia de diário, nenhum exame) veria a nuvem apagá-las caladamente
  // ao entrar em outro aparelho.
  function temDadosLocais() {
    return Object.keys(S.days || {}).some(d => (S.days[d].items || []).length)
      || Object.keys(S.weights || {}).length > 0
      || (S.customFoods || []).length > 0
      || (S.labExams || []).length > 0
      || (S.imgExams || []).length > 0
      || (S.analyses || []).length > 0
      || ((S.chat || {}).mensagens || []).length > 0;
  }

  // Resolve o encontro entre o que está aqui e o que está na nuvem.
  // Chamada ao entrar (login/cadastro/reset) e ao abrir o app já logado.
  // Só libera o envio automático DEPOIS de decidir — antes disso, um envio
  // cego poderia apagar da nuvem o que foi feito em outro aparelho.
  async function sincronizarAoEntrar(msgEl) {
    const diz = (t) => { if (msgEl) { msgEl.className = 'auth-msg'; msgEl.textContent = t; } };
    window.Auth.travarEnvio();
    diz('Buscando seus dados na nuvem…');
    let remoto = null;
    try {
      remoto = await window.Auth.baixarDados();
    } catch (e) {
      // offline: não libera envio automático — melhor ficar pendente do que
      // arriscar sobrescrever a nuvem sem saber o que tem lá
      diz('Entrou, mas não consegui falar com a nuvem agora: ' + e.message + ' Suas alterações vão subir quando a conexão voltar.');
      return;
    }

    const aplicar = (modo) => {
      window.Store.importJSON(remoto.state, modo);
      S = window.Store.get();
      refreshFoods(); renderAll();
      syncSharedFoods();   // o catálogo comum não vem no blob privado: rebusca
    };

    if (!remoto || !remoto.state) {
      // conta nova: o que existe aqui vira a base na nuvem
      window.Auth.liberarEnvio();
      try { await window.Auth.enviarDados(); } catch (e) { /* sobe depois */ }
      atualizarStatusConta(); diz('');
      return;
    }
    if (!temDadosLocais()) {
      aplicar('replace');
      window.Auth.liberarEnvio();
      atualizarStatusConta();
      toast('Seus dados voltaram da nuvem ✅', 'ok');
      diz('');
      return;
    }

    // Os dois lados têm dados. Se a nuvem não mudou desde o último envio
    // DESTE aparelho, o local é a versão mais nova — segue sem incomodar.
    const c = contaInfo();
    const nuvemNova = !c.lastSyncAt || !remoto.updatedAt
      || new Date(remoto.updatedAt) > new Date(c.lastSyncAt);
    if (!nuvemNova) {
      window.Auth.liberarEnvio();
      atualizarStatusConta(); diz('');
      return;
    }

    // A nuvem é mais NOVA — mas é DIFERENTE? Um envio deste próprio aparelho
    // que chegou ao servidor e cuja resposta não voltou a tempo (a pessoa
    // fechou o app, o aparelho dormiu, a rede caiu no meio) grava lá uma data
    // mais nova sem que o `lastSyncAt` daqui tenha sido atualizado. Perguntar
    // nesse caso é alarme falso — e ensina a pessoa a clicar sem ler no único
    // modal que ela precisa mesmo ler. Entre dois estados IGUAIS não há o que
    // decidir: adota-se a data da nuvem e segue. Comparação byte a byte, com
    // o mesmo serializador dos dois lados; qualquer diferença cai no modal.
    if (remoto.state === window.Store.exportJSON({ paraNuvem: true })) {
      c.lastSyncAt = remoto.updatedAt;
      window.Store.save();
      window.Auth.liberarEnvio();
      atualizarStatusConta(); diz('');
      return;
    }

    // Conflito real: nunca decidir sozinho — é aqui que se perde histórico.
    diz('');
    const quando = remoto.updatedAt ? new Date(remoto.updatedAt).toLocaleString('pt-BR') : '?';
    const fecharCom = (fn) => () => { fn(); window.Auth.liberarEnvio(); atualizarStatusConta(); m.close(); };
    const corpo = h('div', {}, [
      h('p', { class: 'note' }, 'Este aparelho tem dados, e a nuvem tem uma versão mais recente (de ' + quando + ') — provavelmente de outro aparelho. O que fazer?'),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary',
          onclick: fecharCom(() => { aplicar('merge'); window.Auth.agendarEnvio(); toast('Dados juntados ✅', 'ok'); }),
        }, '⇄ Juntar os dois (recomendado)'),
        h('button', {
          class: 'btn',
          onclick: () => {
            if (!confirm('Isso APAGA os dados deste aparelho e usa os da nuvem. Continuar?')) return;
            fecharCom(() => { aplicar('replace'); toast('Dados da nuvem aplicados ✅', 'ok'); })();
          },
        }, '☁ Usar só os da nuvem'),
        h('button', {
          class: 'btn',
          onclick: () => {
            if (!confirm('Isso vai SOBRESCREVER na nuvem a versão de ' + quando + ' com os dados deste aparelho. Continuar?')) return;
            fecharCom(() => {
              window.Auth.enviarDados().then(() => toast('Nuvem atualizada com este aparelho ✅', 'ok'))
                .catch(e => toast('Não consegui enviar: ' + e.message, 'error'));
            })();
          },
        }, '📱 Usar só os deste aparelho'),
      ]),
      h('p', { class: 'hint' }, '“Juntar” soma dias, pesagens, exames, métricas e alimentos dos dois lados, sem duplicar registros iguais. É a única opção que não descarta nada.'),
    ]);
    const m = modal('Dados em dois lugares', corpo);
  }

  // ---- tela de entrar / criar conta / esqueci a senha ----
  function abrirLogin(abaInicial) {
    let aba = abaInicial || 'entrar';
    const corpo = h('div', {});
    const m = modal('Sua conta', corpo);

    function campo(label, attrs) {
      const inp = h('input', Object.assign({ class: 'in' }, attrs));
      return { wrap: h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), inp]), inp };
    }

    function render() {
      clear(corpo);
      const tabs = h('div', { class: 'auth-tabs' }, [
        h('button', { class: aba === 'entrar' ? 'active' : '', onclick: () => { aba = 'entrar'; render(); } }, 'Entrar'),
        h('button', { class: aba === 'criar' ? 'active' : '', onclick: () => { aba = 'criar'; render(); } }, 'Criar conta'),
        h('button', { class: aba === 'esqueci' ? 'active' : '', onclick: () => { aba = 'esqueci'; render(); } }, 'Esqueci'),
      ]);
      corpo.appendChild(tabs);
      const msg = h('p', { class: 'auth-msg' });
      const emailF = campo('E-mail', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com', value: window.Auth.email() || '' });

      function comBotao(texto, acao, extras) {
        const btn = h('button', { class: 'btn primary' }, texto);
        btn.addEventListener('click', async () => {
          msg.className = 'auth-msg';
          msg.textContent = '⏳ um instante…';
          corpo.classList.add('auth-busy');
          try {
            await acao();
          } catch (e) {
            msg.className = 'auth-msg erro';
            msg.textContent = '⚠ ' + e.message;
          }
          corpo.classList.remove('auth-busy');
        });
        return h('div', {}, [h('div', { class: 'btn-row' }, [btn].concat(extras || [])), msg]);
      }

      if (aba === 'entrar') {
        const senhaF = campo('Senha', { type: 'password', autocomplete: 'current-password', placeholder: 'sua senha' });
        corpo.appendChild(h('p', { class: 'note' }, 'Entre para guardar tudo na nuvem e recuperar seus dados em qualquer aparelho.'));
        corpo.appendChild(emailF.wrap);
        corpo.appendChild(senhaF.wrap);
        corpo.appendChild(comBotao('Entrar', async () => {
          await window.Auth.entrar(emailF.inp.value.trim(), senhaF.inp.value);
          atualizarStatusConta(); renderDados();
          msg.className = 'auth-msg ok';
          await sincronizarAoEntrar(msg);
          if (!msg.textContent) m.close();
        }));
      } else if (aba === 'criar') {
        const senhaF = campo('Senha (mínimo 8 caracteres)', { type: 'password', autocomplete: 'new-password', placeholder: 'escolha uma senha' });
        const senha2F = campo('Repita a senha', { type: 'password', autocomplete: 'new-password' });
        const convF = campo('Código de convite', { type: 'text', placeholder: 'o código que o dono do app te passou' });
        corpo.appendChild(h('p', { class: 'note' }, 'A conta guarda seu histórico na nuvem e permite recuperar a senha por e-mail. Use um e-mail que você realmente acessa — é por ele que a recuperação funciona.'));
        corpo.appendChild(emailF.wrap);
        corpo.appendChild(senhaF.wrap);
        corpo.appendChild(senha2F.wrap);
        corpo.appendChild(convF.wrap);
        corpo.appendChild(comBotao('Criar conta', async () => {
          const senha = senhaF.inp.value;
          if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
          if (senha !== senha2F.inp.value) throw new Error('As duas senhas não são iguais.');
          await window.Auth.criarConta(emailF.inp.value.trim(), senha, convF.inp.value.trim());
          atualizarStatusConta(); renderDados();
          await sincronizarAoEntrar(msg);
          toast('Conta criada ✅ Seus dados agora ficam na nuvem.', 'ok');
          if (!msg.textContent) m.close();
        }));
        corpo.appendChild(h('p', { class: 'hint' }, 'Honestidade: neste modelo, quem administra o servidor consegue ler os dados guardados — é o preço de poder recuperar a senha. Quem quiser sigilo absoluto pode usar o backup por senha do app, mais abaixo na aba Dados, que ninguém consegue abrir (nem para recuperar).'));
      } else {
        corpo.appendChild(h('p', { class: 'note' }, 'Enviamos um link para o seu e-mail. Ele vale por 30 minutos e abre a tela de nova senha aqui mesmo.'));
        corpo.appendChild(emailF.wrap);
        corpo.appendChild(comBotao('Enviar link de recuperação', async () => {
          await window.Auth.esqueciSenha(emailF.inp.value.trim());
          msg.className = 'auth-msg ok';
          msg.textContent = '✅ Se existe conta com esse e-mail, o link já foi enviado. Confira a caixa de entrada (e o spam).';
        }));
      }
    }
    render();
    return m;
  }

  // ---- nova senha (aberta pelo link do e-mail) ----
  function abrirRedefinicao(token) {
    const corpo = h('div', {});
    const m = modal('Criar nova senha', corpo, () => { modalRecuperacao = null; });
    const msg = h('p', { class: 'auth-msg' });
    const emailI = h('input', { class: 'in', type: 'email', inputmode: 'email', placeholder: 'voce@exemplo.com', value: window.Auth.email() || '' });
    const s1 = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', placeholder: 'nova senha (mín. 8)' });
    const s2 = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', placeholder: 'repita a nova senha' });
    const btn = h('button', { class: 'btn primary' }, 'Salvar nova senha');
    btn.addEventListener('click', async () => {
      msg.className = 'auth-msg'; msg.textContent = '⏳ um instante…';
      corpo.classList.add('auth-busy');
      try {
        if (s1.value.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        if (s1.value !== s2.value) throw new Error('As duas senhas não são iguais.');
        await window.Auth.redefinirSenha(token, emailI.value.trim(), s1.value);
        window.Auth.limparHash();
        liberarApp(); // pode ter chegado aqui com o portão travado (link direto, sem sessão)
        await sincronizarAoEntrar(msg);
        toast('Senha trocada e você já está dentro ✅', 'ok');
        if (!msg.textContent) m.close();
      } catch (e) {
        msg.className = 'auth-msg erro';
        msg.textContent = '⚠ ' + e.message;
      }
      corpo.classList.remove('auth-busy');
    });
    corpo.appendChild(h('p', { class: 'note' }, 'Confirme o e-mail da conta e escolha a nova senha. O e-mail é necessário porque a senha é preparada aqui no aparelho antes de sair.'));
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'E-mail da conta'), emailI]));
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Nova senha'), s1]));
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Repita'), s2]));
    corpo.appendChild(h('div', { class: 'btn-row' }, [btn]));
    corpo.appendChild(msg);
    corpo.appendChild(h('p', { class: 'hint' }, 'Seus dados na nuvem continuam lá — trocar a senha não apaga nada.'));
    return m;
  }

  function abrirTrocaDeSenha() {
    const corpo = h('div', {});
    const m = modal('Trocar senha', corpo);
    const msg = h('p', { class: 'auth-msg' });
    const atual = h('input', { class: 'in', type: 'password', autocomplete: 'current-password' });
    const nova = h('input', { class: 'in', type: 'password', autocomplete: 'new-password' });
    const btn = h('button', { class: 'btn primary' }, 'Salvar');
    btn.addEventListener('click', async () => {
      msg.className = 'auth-msg'; msg.textContent = '⏳…';
      try {
        if (nova.value.length < 8) throw new Error('A senha nova precisa ter pelo menos 8 caracteres.');
        await window.Auth.trocarSenha(atual.value, nova.value);
        m.close();
        toast('Senha trocada ✅', 'ok');
      } catch (e) {
        msg.className = 'auth-msg erro';
        msg.textContent = '⚠ ' + e.message;
      }
    });
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Senha atual'), atual]));
    corpo.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Senha nova'), nova]));
    corpo.appendChild(h('div', { class: 'btn-row' }, [btn]));
    corpo.appendChild(msg);
    return m;
  }

  // ---- cartão da chave da API (uma por pessoa) ----
  // Cada conta usa a PRÓPRIA chave: o custo de foto e análise cai em quem
  // usa, não em quem hospeda o app. A chave fica cifrada no servidor e nunca
  // volta inteira para o navegador nem entra no backup.
  function renderChaveCard() {
    const card = h('div', { class: 'card' }, [h('h3', {}, '🔑 Sua chave da Anthropic')]);
    if (!window.Auth.logado()) {
      card.appendChild(h('p', { class: 'note' }, 'Entre na sua conta para cadastrar sua chave. Ela é o que faz a foto e a análise funcionarem — e o custo vai para a SUA conta da Anthropic.'));
      return card;
    }
    const status = h('p', { class: 'hint' }, 'Verificando…');
    const input = h('input', { type: 'password', class: 'in', placeholder: 'sk-ant-…', autocomplete: 'off' });
    const msg = h('p', { class: 'auth-msg' });
    const acoes = h('div', { class: 'btn-row' });

    const pintar = (st) => {
      if (st.configured) {
        status.className = 'hint';
        status.textContent = '✅ Chave cadastrada (final …' + st.hint + ')'
          + (st.updatedAt ? ' · desde ' + new Date(st.updatedAt).toLocaleDateString('pt-BR') : '');
      } else {
        status.className = 'hint comp-warn';
        status.textContent = '⚠ Sem chave: foto, leitura de rótulo e análise não vão funcionar até você cadastrar a sua.';
      }
      clear(acoes);
      const btn = h('button', { class: 'btn primary' }, st.configured ? 'Trocar a chave' : 'Salvar chave');
      btn.addEventListener('click', async () => {
        msg.className = 'auth-msg'; msg.textContent = '⏳ testando a chave na Anthropic…';
        btn.disabled = true;
        try {
          await window.Auth.salvarChave(input.value.trim());
          input.value = '';
          msg.className = 'auth-msg ok'; msg.textContent = '✅ Chave válida e guardada.';
          pintar(await window.Auth.statusChave());
        } catch (e) {
          msg.className = 'auth-msg erro'; msg.textContent = '⚠ ' + e.message;
        }
        btn.disabled = false;
      });
      acoes.appendChild(btn);
      if (st.configured) {
        acoes.appendChild(h('button', {
          class: 'btn danger', onclick: async () => {
            if (!confirm('Remover sua chave? Foto e análise param de funcionar até você cadastrar outra.')) return;
            try { await window.Auth.removerChave(); pintar(await window.Auth.statusChave()); msg.textContent = ''; }
            catch (e) { msg.className = 'auth-msg erro'; msg.textContent = '⚠ ' + e.message; }
          },
        }, 'Remover'));
      }
    };

    card.appendChild(h('p', { class: 'note' }, 'A foto e a análise usam inteligência artificial, que é paga por uso. Cada pessoa cadastra a própria chave e paga só o que usar — normalmente centavos por foto.'));
    card.appendChild(h('ol', { class: 'import-steps' }, [
      h('li', {}, [ 'Crie uma conta em ', h('a', { href: 'https://console.anthropic.com', target: '_blank', rel: 'noopener' }, 'console.anthropic.com'), ' e coloque créditos (US$ 5 já duram bastante).' ]),
      h('li', {}, 'Em API Keys, crie uma chave e copie (começa com sk-ant-).'),
      h('li', {}, 'Cole abaixo e salve — o app testa na hora se ela funciona.'),
    ]));
    card.appendChild(status);
    card.appendChild(h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Chave da API'), input]));
    card.appendChild(acoes);
    card.appendChild(msg);
    card.appendChild(h('p', { class: 'hint' }, 'A chave fica guardada cifrada no servidor, não sai no backup e nunca é mostrada inteira de volta. Defina um limite de gasto no console da Anthropic para dormir tranquilo.'));

    window.Auth.statusChave().then(pintar).catch(e => {
      status.className = 'hint comp-warn';
      status.textContent = '⚠ Não consegui verificar: ' + e.message;
      clear(acoes);
    });
    return card;
  }

  // ---- cartão da conta na aba Dados ----
  function renderContaCard() {
    const c = contaInfo();
    if (!window.Auth.logado()) {
      return h('div', { class: 'card' }, [
        h('h3', {}, '👤 Sua conta'),
        h('p', { class: 'note' }, 'Sem conta, seus dados existem SÓ neste aparelho — e desaparecem se você remover o app da tela de início ou trocar de celular. Com conta, tudo fica guardado na nuvem e volta com um login.'),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn primary', onclick: () => abrirLogin('entrar') }, 'Entrar'),
          h('button', { class: 'btn', onclick: () => abrirLogin('criar') }, 'Criar conta'),
        ]),
        h('p', { class: 'hint' }, 'Precisa de um código de convite (o dono do app te passa). A recuperação de senha é por e-mail.'),
      ]);
    }
    const pend = window.Auth.temPendencia();
    return h('div', { class: 'card' }, [
      h('h3', {}, '👤 Sua conta'),
      h('div', { class: 'conta-linha' }, [
        h('div', {}, [
          h('div', {}, [h('span', { class: 'sync-dot' + (pend ? ' pend' : '') }), ' ', h('strong', {}, c.email)]),
          h('div', { class: 'hint' }, pend
            ? 'Enviando alterações…'
            : (c.lastSyncAt ? 'Sincronizado em ' + new Date(c.lastSyncAt).toLocaleString('pt-BR') : 'Aguardando o primeiro envio…')),
        ]),
      ]),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn', onclick: async () => {
            try { await window.Auth.enviarDados(); atualizarStatusConta(); renderDados(); toast('Enviado para a nuvem ✅', 'ok'); }
            catch (e) { toast('Não consegui enviar: ' + e.message, 'error'); }
          },
        }, '☁ Enviar agora'),
        h('button', {
          class: 'btn', onclick: async () => {
            try {
              const r = await window.Auth.baixarDados();
              if (!r || !r.state) { toast('Esta conta ainda não tem dados na nuvem.', 'error'); return; }
              const quando = r.updatedAt ? new Date(r.updatedAt).toLocaleString('pt-BR') : '?';
              if (!confirm('Restaurar os dados de ' + quando + '?\n\nIsto SUBSTITUI os dados deste aparelho.')) return;
              window.Store.importJSON(r.state, 'replace');
              S = window.Store.get();
              refreshFoods(); renderAll();
              syncSharedFoods();   // rebusca o catálogo comum
              toast('Restaurado da nuvem ✅', 'ok');
            } catch (e) { toast('Não consegui baixar: ' + e.message, 'error'); }
          },
        }, '⬇ Restaurar da nuvem'),
        h('button', { class: 'btn', onclick: abrirTrocaDeSenha }, '🔑 Trocar senha'),
        h('button', {
          class: 'btn danger', onclick: async () => {
            if (!confirm('Sair da conta neste aparelho?\n\nVocê vai precisar entrar de novo para abrir o app. Seus dados continuam salvos na nuvem.')) return;
            await window.Auth.sair();
            toast('Você saiu da conta.', 'ok');
            mostrarPortao();
          },
        }, 'Sair'),
      ]),
      h('p', { class: 'hint' }, 'Tudo que você registra é enviado sozinho, poucos segundos depois de salvar.'),
    ]);
  }

  // ================= MODAIS =================
  function modal(title, bodyNode, aoFechar) {
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } });
    function close() { back.remove(); if (aoFechar) aoFechar(); }
    back.appendChild(h('div', { class: 'modal' }, [
      h('div', { class: 'modal-head' }, [h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close }, '✕')]),
      bodyNode,
    ]));
    document.body.appendChild(back);
    return { close, back };
  }

  function openFoodSearch(query, onPick) {
    const results = h('div', { class: 'search-results' });
    const input = h('input', { type: 'text', class: 'in', placeholder: 'buscar alimento…', value: query || '' });
    const m = modal('Buscar alimento', h('div', {}, [
      input,
      h('div', { class: 'hint' }, 'Base TACO + seus alimentos. Não achou? Cadastre um novo.'),
      results,
      h('button', { class: 'btn', onclick: () => { m.close(); openCustomFoodForm(input.value, id => onPick(id)); } }, '+ Cadastrar novo alimento'),
    ]));
    function run() {
      clear(results);
      const q = window.Parser.normalize(input.value);
      const foods = window.Parser.getFoods();
      let matches;
      if (!q) matches = [];
      else {
        const toks = q.split(' ');
        matches = foods.filter(f => toks.every(t => f.norm.includes(t))).slice(0, 40);
      }
      if (!matches.length) results.appendChild(h('p', { class: 'empty' }, q ? 'Nada encontrado.' : 'Digite para buscar.'));
      matches.forEach(f => results.appendChild(h('button', {
        class: 'search-item', onclick: () => { onPick(f.id); m.close(); },
      }, [
        h('span', {}, f.name),
        h('span', { class: 'si-kcal' }, (f.kcal != null ? f.kcal + ' kcal' : 'sem kcal') + '/100g · ' + srcLabel(f)),
      ])));
    }
    input.addEventListener('input', run);
    run();
    setTimeout(() => input.focus(), 30);
  }

  function openCustomFoodForm(prefillName, onSaved, editing) {
    const vals = editing || { name: prefillName || '', kcal: '', prot: '', carb: '', fat: '', fiber: '' };
    function inp(key, label, step) {
      const i = h('input', { type: key === 'name' ? 'text' : 'number', step: step || '0.1', min: '0', class: 'in', value: vals[key] != null ? vals[key] : '' });
      i.dataset.key = key;
      return h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), i]);
    }
    // ---- duas fotos, dois propósitos ----
    // (1) tabela nutricional: analisada p/ preencher os campos, NÃO é guardada
    // (2) foto do rótulo: só guardada (nenhuma análise, nenhum custo), serve
    //     de referência visual e p/ reconhecer a embalagem em fotos futuras
    let labelPhoto = (editing && editing.labelPhoto) || null;
    const thumbBox = h('div', { class: 'label-thumb' });
    const renderThumb = () => {
      clear(thumbBox);
      if (!labelPhoto) {
        thumbBox.appendChild(h('span', { class: 'hint' }, 'Nenhuma foto do rótulo guardada.'));
        return;
      }
      thumbBox.appendChild(h('img', { src: labelPhoto, alt: 'Foto do rótulo' }));
      thumbBox.appendChild(h('div', {}, [
        h('div', { class: 'hint' }, '🏷️ Rótulo guardado — a câmera reconhece este produto.'),
        h('button', { class: 'link-btn danger', onclick: () => { labelPhoto = null; renderThumb(); } }, 'remover foto'),
      ]));
    };
    renderThumb();

    // (2) botão só-guarda: nem passa pela internet
    const photoIn = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try {
          labelPhoto = 'data:image/jpeg;base64,' + (await compressPhoto(f, 400, 0.65));
          renderThumb();
        } catch (err) {
          toast('Não consegui usar essa foto: ' + err.message, 'error');
        }
      },
    });
    const photoBtn = h('button', {
      class: 'btn', title: 'Só guarda a foto (não analisa nada)',
      onclick: () => photoIn.click(),
    }, '📷 Foto do rótulo');

    const labelIn = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        scanBtn.disabled = true; const old = scanBtn.textContent; scanBtn.textContent = '⏳ lendo rótulo…';
        try {
          const b64 = await compressPhoto(f, 1600); // letra miúda pede resolução
          const data = await analyzePhoto(b64, 'rotulo');
          const res = applyLabelToForm(data.rotulo, body);
          // deu certo: os campos preenchidos são o próprio feedback
          if (!res.ok) toast(res.msg, 'error');
        } catch (err) {
          toast('Não consegui ler o rótulo: ' + err.message, 'error');
        }
        scanBtn.disabled = false; scanBtn.textContent = old;
      },
    });
    const scanBtn = h('button', {
      class: 'btn',
      onclick: () => {
        if (!window.Auth.podeUsarProxy()) {
          toast('Para ler rótulo por foto, entre na sua conta (toque em “entrar”, no topo).', 'error');
          return;
        }
        labelIn.click();
      },
    }, '📷 Fotografar tabela nutricional');

    // compartilhar na base comum (só p/ alimentos novos, com proxy configurado)
    const podeCompartilhar = !editing && window.Auth.podeUsarProxy();
    const shareChk = h('input', { type: 'checkbox', id: 'share-food' });
    if (podeCompartilhar) shareChk.checked = true;

    const body = h('div', {}, [
      inp('name', 'Nome do alimento'),
      h('div', { class: 'btn-row' }, [scanBtn, labelIn, photoBtn, photoIn]),
      thumbBox,
      h('div', { class: 'form-grid' }, [
        inp('kcal', 'kcal /100g', '1'), inp('prot', 'Proteína /100g'),
        inp('carb', 'Carbo /100g'), inp('fat', 'Gordura /100g'),
        inp('fiber', 'Fibra /100g (opcional)'),
      ]),
      h('p', { class: 'hint' }, '“Tabela nutricional”: lê a foto e preenche os campos abaixo (a foto não é guardada). “Foto do rótulo”: só guarda a imagem do produto, para você reconhecer depois. Confira sempre os valores com a embalagem.'),
      podeCompartilhar ? h('div', { class: 'adaptive-toggle' }, [
        shareChk,
        h('label', { for: 'share-food' }, ' 🌐 Compartilhar na base comum — todos os usuários do grupo passam a encontrar este alimento na busca.'),
      ]) : null,
    ]);
    const m = modal(editing ? 'Editar alimento' : 'Novo alimento', h('div', {}, [
      body,
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary', onclick: () => {
            const data = {};
            body.querySelectorAll('input').forEach(i => { data[i.dataset.key] = i.value; });
            if (!data.name || !data.name.trim()) { alert('Dê um nome ao alimento.'); return; }
            if (editing) {
              window.Store.updateCustomFood(editing.id, {
                name: data.name.trim(),
                kcal: numOrNull(data.kcal), prot: numOrNull(data.prot), carb: numOrNull(data.carb), fat: numOrNull(data.fat), fiber: numOrNull(data.fiber),
                labelPhoto: labelPhoto,
              });
              refreshFoods(); m.close(); onSaved && onSaved(editing.id);
            } else {
              data.labelPhoto = labelPhoto;
              const rec = window.Store.addCustomFood(data);
              refreshFoods(); m.close(); onSaved && onSaved(rec.id);
              if (podeCompartilhar && shareChk.checked) {
                shareFood(rec).then(r => {
                  if (!r.ok) toast('Salvo aqui, mas não compartilhado: ' + r.detail, 'error');
                });
              }
            }
          },
        }, 'Salvar'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
      ]),
    ]));
  }
  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ============ RECEITAS ============
  // Uma receita soma os nutrientes dos ingredientes e vira um alimento do
  // usuário com valores por 100 g. Se a pessoa pesar o resultado pronto
  // (peso final), a densidade fica exata; sem isso usamos a soma dos
  // ingredientes — marcado como estimativa (bolo perde água no forno).
  function computeRecipe(ings, finalWeight) {
    const tot = { kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0 };
    let rawWeight = 0;
    let pendentes = 0;
    ings.forEach(ing => {
      const f = window.Parser.getFood(ing.foodId);
      if (!f || !(ing.grams > 0) || f.kcal == null) { pendentes++; return; }
      const n = window.Nutrition.itemNutrients(f, ing.grams);
      tot.kcal += n.kcal; tot.prot += n.prot; tot.carb += n.carb;
      tot.fat += n.fat; tot.fiber += n.fiber;
      rawWeight += ing.grams;
    });
    const fw = finalWeight > 0 ? finalWeight : rawWeight;
    const per100 = fw > 0 ? {
      kcal: Math.round(tot.kcal / fw * 1000) / 10,
      prot: Math.round(tot.prot / fw * 1000) / 10,
      carb: Math.round(tot.carb / fw * 1000) / 10,
      fat: Math.round(tot.fat / fw * 1000) / 10,
      fiber: Math.round(tot.fiber / fw * 1000) / 10,
    } : null;
    return { tot, rawWeight, fw, per100, pendentes };
  }

  function openRecipeForm(onSaved, editing) {
    let ings = [];
    if (editing && editing.recipe) {
      ings = editing.recipe.ingredients.map(i => {
        const f = window.Parser.getFood(i.foodId);
        return { foodText: f ? f.name : '(removido)', foodId: i.foodId, grams: i.grams, match: f ? 'matched' : 'not_found' };
      });
    }

    const nameInput = h('input', { type: 'text', class: 'in', placeholder: 'ex.: Bolo da casa', value: editing ? editing.name : '' });
    const ta = h('textarea', { rows: '3', placeholder: '500 g trigo\n300 g manteiga\n100 g leite\n4 ovos' });
    const fwInput = h('input', {
      type: 'number', min: '0', step: '1', class: 'in', placeholder: 'opcional — pese o pronto',
      value: editing && editing.recipe && editing.recipe.finalWeight ? editing.recipe.finalWeight : '',
    });
    fwInput.addEventListener('change', () => renderRows());
    const rowsBox = h('div', { class: 'rec-rows' });
    const totalsBox = h('div');

    function addFromText() {
      window.Parser.parseText(ta.value).forEach(p => {
        ings.push({ foodText: p.foodText, foodId: p.foodId, grams: p.grams, match: p.matchStatus });
      });
      ta.value = '';
      renderRows();
    }

    // foto de ingredientes (reusa o fluxo da Fase 2)
    const photoIn = h('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      onchange: async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (!window.Auth.podeUsarProxy()) { toast('Para usar foto, entre na sua conta (toque em “entrar”, no topo).', 'error'); return; }
        photoBtn.disabled = true; const old = photoBtn.textContent; photoBtn.textContent = '⏳…';
        try {
          const b64 = await compressPhoto(f);
          const data = await analyzePhoto(b64);
          (data.itens || []).forEach(it => {
            if (!it || !it.nome || !(it.gramas > 0)) return;
            const m = window.Parser.matchFood(it.nome);
            ings.push({ foodText: it.nome, foodId: m.foodId, grams: Math.round(it.gramas), match: m.status });
          });
        } catch (err) { toast('Não consegui analisar a foto: ' + err.message, 'error'); }
        photoBtn.disabled = false; photoBtn.textContent = old;
        renderRows();
      },
    });
    const photoBtn = h('button', { class: 'btn', onclick: () => photoIn.click() }, '📷 Foto');

    function renderRows() {
      clear(rowsBox);
      if (!ings.length) rowsBox.appendChild(h('p', { class: 'empty' }, 'Nenhum ingrediente ainda.'));
      ings.forEach((ing, idx) => {
        const food = window.Parser.getFood(ing.foodId);
        const noKcal = food && food.kcal == null;
        const pendente = !food || noKcal || !(ing.grams > 0);
        const n = window.Nutrition.itemNutrients(food, ing.grams);
        const row = h('div', { class: 'rec-row' + (pendente || ing.match === 'ambiguous' ? ' rec-warn' : '') }, [
          h('button', {
            class: 'item-name',
            title: 'Trocar/confirmar ingrediente',
            onclick: () => openFoodSearch(ing.foodText, id => { ing.foodId = id; ing.match = 'matched'; renderRows(); }),
          }, food ? food.name : (ing.foodText + ' — escolher…')),
          h('input', {
            type: 'number', class: 'grams', min: '0', step: '1',
            value: ing.grams != null ? Math.round(ing.grams) : '', placeholder: 'g',
            onchange: e => { ing.grams = e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.')); renderRows(); },
          }),
          h('span', { class: 'unit' }, 'g'),
          h('div', { class: 'item-kcal' }, food && !noKcal && ing.grams > 0 ? Math.round(n.kcal) + ' kcal' : '—'),
          h('button', { class: 'del', onclick: () => { ings.splice(idx, 1); renderRows(); } }, '✕'),
        ]);
        if (ing.match === 'ambiguous' && food) row.appendChild(h('div', { class: 'hint' }, '⚠ vários parecidos — toque no nome p/ confirmar'));
        if (food && noKcal) row.appendChild(h('div', { class: 'hint' }, '⚠ sem valor na TACO — troque ou cadastre em Meus alimentos'));
        if (!food) row.appendChild(h('div', { class: 'hint' }, '⚠ não encontrado — toque p/ escolher da base'));
        rowsBox.appendChild(row);
      });

      clear(totalsBox);
      if (ings.length) {
        const fwVal = fwInput.value === '' ? null : Number(String(fwInput.value).replace(',', '.'));
        const c = computeRecipe(ings, fwVal);
        totalsBox.appendChild(h('p', { class: 'note' },
          `Soma dos ingredientes: ${Math.round(c.tot.kcal)} kcal · P ${Math.round(c.tot.prot)} g · C ${Math.round(c.tot.carb)} g · G ${Math.round(c.tot.fat)} g (${Math.round(c.rawWeight)} g).`));
        if (c.per100) {
          totalsBox.appendChild(h('p', { class: 'note' },
            `Rende ${Math.round(c.fw)} g → ${c.per100.kcal} kcal por 100 g` +
            (fwVal > 0 ? '.' : ' — usando a soma dos ingredientes; pese o pronto p/ ficar exato (assados perdem água).')));
        }
        if (c.pendentes) totalsBox.appendChild(h('p', { class: 'note' }, `⚠ ${c.pendentes} ingrediente(s) pendente(s) fora da soma.`));
      }
    }

    const m = modal(editing ? 'Editar receita' : 'Nova receita', h('div', {}, [
      h('div', { class: 'field' }, [h('label', { class: 'lbl' }, 'Nome da receita'), nameInput]),
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Ingredientes (um por linha, como na aba Hoje)'),
        ta,
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn', onclick: addFromText }, '+ Adicionar ingredientes'),
          photoIn, photoBtn,
        ]),
      ]),
      rowsBox,
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Peso final depois de pronto (g)'),
        fwInput,
      ]),
      totalsBox,
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameInput.value.trim();
            if (!name) { alert('Dê um nome à receita.'); return; }
            if (!ings.length) { alert('Adicione pelo menos um ingrediente.'); return; }
            const pendente = ings.find(i => {
              const f = window.Parser.getFood(i.foodId);
              return !f || f.kcal == null || !(i.grams > 0);
            });
            if (pendente) { alert('Há ingrediente pendente (sem alimento, sem gramas ou sem valor na TACO). Resolva os marcados com ⚠ antes de salvar.'); return; }
            const fwVal = fwInput.value === '' ? null : Number(String(fwInput.value).replace(',', '.'));
            const c = computeRecipe(ings, fwVal);
            const payload = {
              name,
              kcal: c.per100.kcal, prot: c.per100.prot, carb: c.per100.carb,
              fat: c.per100.fat, fiber: c.per100.fiber,
              recipe: {
                ingredients: ings.map(i => ({ foodId: i.foodId, grams: Math.round(i.grams) })),
                finalWeight: fwVal > 0 ? Math.round(fwVal) : null,
              },
            };
            if (editing) window.Store.updateCustomFood(editing.id, payload);
            else window.Store.addCustomFood(payload);
            refreshFoods();
            m.close();
            onSaved && onSaved();
          },
        }, 'Salvar receita'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
      ]),
    ]));
    renderRows();
    setTimeout(() => nameInput.focus(), 30);
  }

  // funções expostas p/ testes automatizados
  return {
    init, addPhotoItems, compressPhoto, analyzePhoto, computeRecipe, openRecipeForm,
    applyLabelToForm, pushBackup, restoreBackup,
    buildAnalysisPayload, buildTreinoPayload, reminderDue, goTo, renderMeds,
    analisarPlato, renderAll, versaoAtual, abrirNovidades,
    atualizarStatusConta, abrirLogin, sincronizarAoEntrar,
  };
})();

document.addEventListener('DOMContentLoaded', window.App.init);
