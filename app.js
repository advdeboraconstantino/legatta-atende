/* =====================================================================
   LEGATTA ATENDE · FASE 1 · CRM da equipe (funis, leads, equipe, painel)
   ===================================================================== */
(function () {
'use strict';

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const ini = n => String(n || '?').replace(/^(Dra?\.)\s*/i, '').split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';
const dt = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const days = d => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const ago = d => { const n = days(d); return n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`; };
const ls = { get(k, d) { try { const v = localStorage.getItem('legatta:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('legatta:' + k, JSON.stringify(v)); } catch (e) {} } };
function toast(t, bad) { const el = $('#toast'); el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), bad ? 4200 : 2400); }
function fail(e, what) {
  console.error(e);
  const m = (e && (e.message || e.error_description)) || String(e);
  const map = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/User already registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/rate limit/i, 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'],
    [/row-level security|permission denied/i, 'Você não tem permissão para esta ação.'],
    [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique a internet.']
  ];
  const hit = map.find(([r]) => r.test(m));
  toast((what ? what + ': ' : '') + (hit ? hit[1] : m), true);
}
let armed = null;
function confirm2(key, btn, msg) {
  if (armed === key) { armed = null; return true; }
  armed = key; btn.textContent = 'Confirmar'; btn.classList.add('danger'); toast(msg || 'Clique de novo para confirmar.');
  setTimeout(() => { if (armed === key) armed = null; }, 4500);
  return false;
}
const TEMP = { hot: ['t-hot', 'Quente'], warm: ['t-warm', 'Morno'], cold: ['t-cold', 'Frio'] };
const ORIGENS = ['Anúncio Instagram', 'Instagram orgânico', 'Anúncio Facebook', 'Google', 'Indicação', 'Site', 'WhatsApp direto', 'Evento / palestra', 'Outro'];
const ROLES = ['Advogado(a)', 'Atendente', 'Estagiário(a)', 'Secretário(a)', 'Gestor(a) comercial'];
const STAGE_COLORS = ['#86979E', '#C59A3D', '#1D5F78', '#0E3B4F', '#A86A00', '#1E7A4F', '#B3261E', '#7A3B6B', '#4B5BA8'];
const waLink = p => { let d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.length === 10 || d.length === 11) d = '55' + d; return 'https://wa.me/' + d; };

/* ---------- Tema ---------- */
const root = document.documentElement;
const savedTheme = ls.get('theme', null); if (savedTheme) root.dataset.theme = savedTheme;
function toggleTheme() { const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; root.dataset.theme = dark ? 'light' : 'dark'; ls.set('theme', root.dataset.theme); }

/* ---------- Configuração ---------- */
const CFG = window.LEGATTA_CONFIG || {};
if (!window.supabase || !CFG.SUPABASE_URL || /COLE_AQUI/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY)) {
  app.innerHTML = `<div class="auth"><div class="card auth-card">${brandBlock()}
    <div class="err">Sistema ainda não configurado.</div>
    <p class="muted" style="margin:0">Abra o arquivo <b>config.js</b> e cole a <b>Project URL</b> e a chave <b>anon</b> do seu projeto Supabase, conforme o passo 3 do guia de instalação.</p></div></div>`;
  return;
}
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const officeName = CFG.NOME_ESCRITORIO || 'Escritório';
function brandBlock() { return `<div class="auth-brand"><svg width="46" height="46"><use href="#logo"/></svg><div><b>Legatta</b><small>Atende</small></div></div>`; }

/* ---------- Estado ---------- */
const S = { user: null, me: null, profiles: [], funnels: [], stages: [], leads: [], route: ls.get('route', 'kanban'), fun: ls.get('fun', null),
  q: '', resp: 'all', temp: 'all', editing: false, newLead: false, openLead: null, notes: [], channel: null, booted: false };
const P = id => S.profiles.find(p => p.id === id);
const stagesOf = fid => S.stages.filter(s => s.funnel_id === fid).sort((a, b) => a.position - b.position);
const stageById = id => S.stages.find(s => s.id === id);
const isAdmin = () => S.me && S.me.perm === 'admin' && S.me.active;

/* ---------- Autenticação ---------- */
let authTab = 'in', recovering = false;
function renderAuth(msg) {
  app.innerHTML = `<div class="auth"><form class="card auth-card" id="af" novalidate>${brandBlock()}
    <p class="muted" style="margin:0">${esc(officeName)}</p>
    ${recovering ? `<h2>Definir nova senha</h2>
      <div class="field"><label for="np">Nova senha</label><input type="password" id="np" autocomplete="new-password" minlength="8" required></div>
      <button class="btn pri block" id="ab">Salvar nova senha</button>` : `
    <div class="tabs" role="tablist"><button type="button" class="${authTab === 'in' ? 'on' : ''}" data-tab="in">Entrar</button><button type="button" class="${authTab === 'up' ? 'on' : ''}" data-tab="up">Criar conta</button></div>
    ${authTab === 'up' ? `<div class="field"><label for="an">Nome de exibição</label><input type="text" id="an" autocomplete="name" placeholder="Como o cliente e a equipe verão seu nome" required></div>` : ''}
    <div class="field"><label for="ae">E-mail</label><input type="email" id="ae" autocomplete="email" required></div>
    ${authTab !== 'reset' ? `<div class="field"><label for="ap">Senha</label><input type="password" id="ap" autocomplete="${authTab === 'up' ? 'new-password' : 'current-password'}" required>${authTab === 'up' ? '<small>Mínimo de 8 caracteres.</small>' : ''}</div>` : ''}
    <button class="btn pri block" id="ab">${authTab === 'up' ? 'Criar conta' : authTab === 'reset' ? 'Enviar link de redefinição' : 'Entrar'}</button>
    ${authTab === 'in' ? '<button type="button" class="linkbtn" id="forgot">Esqueci minha senha</button>' : authTab === 'reset' ? '<button type="button" class="linkbtn" data-tab="in">Voltar para o login</button>' : '<small class="muted">Depois de criar a conta, um administrador do escritório precisa aprovar seu acesso.</small>'}`}
    ${msg ? `<div class="note">${msg}</div>` : ''}
  </form></div>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { authTab = b.dataset.tab; renderAuth(); });
  const fg = $('#forgot'); if (fg) fg.onclick = () => { authTab = 'reset'; renderAuth(); };
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#ab'); btn.disabled = true;
    try {
      if (recovering) {
        const np = $('#np').value; if (np.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.', true); return; }
        const { error } = await sb.auth.updateUser({ password: np }); if (error) throw error;
        recovering = false; history.replaceState(null, '', location.pathname); toast('Senha atualizada.'); start();
        return;
      }
      const email = $('#ae').value.trim();
      if (!email) { toast('Informe o e-mail.', true); return; }
      if (authTab === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error;
        authTab = 'in'; renderAuth('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.'); return;
      }
      const pw = $('#ap').value;
      if (authTab === 'up') {
        const name = $('#an').value.trim();
        if (!name) { toast('Informe o nome de exibição.', true); return; }
        if (pw.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.', true); return; }
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { authTab = 'in'; renderAuth('Conta criada. Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, entre com sua senha.'); }
        return;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error;
    } catch (err) { fail(err); } finally { if (btn.isConnected) btn.disabled = false; }
  };
}

function renderPending() {
  app.innerHTML = `<div class="auth"><div class="card auth-card">${brandBlock()}
    <h2>Aguardando aprovação</h2>
    <p class="muted" style="margin:0">Olá, <b>${esc(S.me ? S.me.name : '')}</b>. Sua conta foi criada. Um administrador do escritório precisa liberar o seu acesso na tela <b>Equipe</b>.</p>
    <div class="row"><button class="btn pri" id="rf">Já fui aprovado(a)</button><button class="btn" id="so">Sair</button></div></div></div>`;
  $('#rf').onclick = start; $('#so').onclick = () => sb.auth.signOut();
}

/* ---------- Carga de dados ---------- */
async function loadMe() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  if (error) throw error; S.me = data;
}
async function loadMeta() {
  const [p, f, s] = await Promise.all([
    sb.from('profiles').select('*').order('created_at'),
    sb.from('funnels').select('*').order('position'),
    sb.from('stages').select('*').order('position')
  ]);
  for (const r of [p, f, s]) if (r.error) throw r.error;
  S.profiles = p.data; S.funnels = f.data; S.stages = s.data;
  S.me = P(S.user.id) || S.me;
  if (!S.funnels.some(x => x.id === S.fun)) S.fun = S.funnels[0] ? S.funnels[0].id : null;
}
async function loadLeads() {
  const { data, error } = await sb.from('leads').select('*').order('updated_at', { ascending: false }).limit(5000);
  if (error) throw error; S.leads = data;
}
async function loadNotes(id) {
  const { data, error } = await sb.from('lead_notes').select('*').eq('lead_id', id).order('created_at', { ascending: false });
  if (error) throw error; S.notes = data;
}
let rt = {};
function debounce(key, fn, ms) { clearTimeout(rt[key]); rt[key] = setTimeout(fn, ms || 300); }
function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = sb.channel('legatta-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => debounce('leads', async () => { try { await loadLeads(); refresh(true); } catch (e) {} }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_notes' }, p => { const id = (p.new && p.new.lead_id) || (p.old && p.old.lead_id); if (S.openLead && (!id || id === S.openLead)) debounce('notes', async () => { try { await loadNotes(S.openLead); paintNotes(); } catch (e) {} }); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, () => debounce('meta', async () => { try { await loadMeta(); refresh(true); } catch (e) {} }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'funnels' }, () => debounce('meta', async () => { try { await loadMeta(); refresh(true); } catch (e) {} }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => debounce('meta', async () => { try { const wasActive = S.me && S.me.active; await loadMeta(); if (wasActive && !(S.me && S.me.active)) return start(); refresh(true); } catch (e) {} }))
    .subscribe();
}

/* ---------- Início ---------- */
let starting = null;
function start() {
  if (starting) return starting;
  starting = doStart().finally(() => { starting = null; });
  return starting;
}
async function doStart() {
  if (recovering) return renderAuth();
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (recovering) return renderAuth();
    if (!session) { S.user = null; if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } return renderAuth(); }
    S.user = session.user;
    await loadMe();
    if (!S.me) { return renderAuth('Não encontramos seu cadastro na equipe. Fale com o administrador do escritório.'); }
    if (!S.me.active) return renderPending();
    await Promise.all([loadMeta(), loadLeads()]);
    renderShell(); subscribe();
  } catch (e) {
    fail(e, 'Não foi possível carregar');
    app.innerHTML = `<div class="auth"><div class="card auth-card">${brandBlock()}<div class="err">Não foi possível conectar ao banco de dados.</div><p class="muted" style="margin:0">Confira a internet e os dados do arquivo config.js. Se o problema continuar, verifique se o script supabase/schema.sql foi executado.</p><div class="row"><button class="btn pri" id="rt">Tentar de novo</button><button class="btn" id="so">Sair</button></div></div></div>`;
    $('#rt').onclick = start; $('#so').onclick = () => sb.auth.signOut();
  }
}
if (/type=recovery/.test(location.hash)) recovering = true;
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; setTimeout(renderAuth, 0); return; }
  if (ev === 'SIGNED_IN' && session && (!S.user || S.user.id !== session.user.id)) { setTimeout(start, 0); return; }
  if (ev === 'SIGNED_OUT') { S.user = null; S.me = null; closeDrawer(); setTimeout(start, 0); }
});
start();

/* ---------- Estrutura ---------- */
const ROUTES = [['kanban', 'Funis e leads', 'i-kanban', 'Funis'], ['painel', 'Painel', 'i-chart', 'Painel'], ['equipe', 'Equipe', 'i-team', 'Equipe'], ['perfil', 'Meu perfil', 'i-user', 'Perfil']];
function renderShell() {
  const pend = isAdmin() ? S.profiles.filter(p => !p.active).length : 0;
  if (!ROUTES.some(r => r[0] === S.route)) S.route = 'kanban';
  app.innerHTML = `<div class="shell">
    <aside class="side" aria-label="Navegação"><div class="brand"><svg width="36" height="36"><use href="#logo"/></svg><div><b>Legatta</b><small>Atende</small></div></div>
      <nav class="nav">${ROUTES.map(([id, t, ic]) => `<button class="${S.route === id ? 'on' : ''}" data-r="${id}"><svg><use href="#${ic}"/></svg>${t}${id === 'equipe' && pend ? `<span class="badge">${pend}</span>` : ''}</button>`).join('')}</nav>
      <div class="side-foot">${esc(officeName)}</div></aside>
    <div class="main"><header class="top"><svg class="mlogo" width="30" height="30"><use href="#logo"/></svg><h1>${ROUTES.find(r => r[0] === S.route)[1]}</h1>
      <button class="ib" id="th" aria-label="Alternar tema"><svg><use href="#i-moon"/></svg></button>
      <div class="who"><span class="pp" style="background:${esc(S.me.color)}">${esc(ini(S.me.name))}</span><span>${esc(S.me.name)}</span></div>
      <button class="ib" id="lo" aria-label="Sair"><svg><use href="#i-out"/></svg></button></header>
      <div class="view" id="view"></div></div></div>
    <nav class="bnav">${ROUTES.map(([id, , ic, s]) => `<button class="${S.route === id ? 'on' : ''}" data-r="${id}"><svg><use href="#${ic}"/></svg>${s}</button>`).join('')}</nav>
    <div id="drawer"></div>`;
  app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.route = b.dataset.r; ls.set('route', S.route); S.editing = false; S.newLead = false; renderShell(); });
  $('#th').onclick = toggleTheme;
  $('#lo').onclick = () => sb.auth.signOut();
  refresh();
  if (S.openLead) paintDrawer();
}
function refresh(fromRealtime) {
  const v = $('#view'); if (!v) return;
  const typing = document.activeElement && v.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (fromRealtime && S.route === 'kanban' && (S.editing || S.newLead || typing)) { paintBoardOnly(); paintDrawerIfOpen(); return; }
  if (fromRealtime && typing) { paintDrawerIfOpen(); return; }
  const st = v.scrollTop;
  ({ kanban: vKanban, painel: vPainel, equipe: vEquipe, perfil: vPerfil })[S.route](v);
  if (fromRealtime) v.scrollTop = st;
  paintDrawerIfOpen();
}
function paintDrawerIfOpen() { if (S.openLead && !S.leads.some(l => l.id === S.openLead)) closeDrawer(); }

/* =====================================================================
   FUNIS (KANBAN)
   ===================================================================== */
function filteredLeads() {
  const q = S.q.trim().toLowerCase();
  return S.leads.filter(l => l.funnel_id === S.fun)
    .filter(l => S.resp === 'all' || (S.resp === 'none' ? !l.assigned_to : l.assigned_to === (S.resp === 'me' ? S.me.id : S.resp)))
    .filter(l => S.temp === 'all' || l.temperatura === S.temp)
    .filter(l => !q || [l.name, l.phone, l.cargo, l.orgao, l.origem].join(' ').toLowerCase().includes(q));
}
function vKanban(v) {
  if (!S.funnels.length) {
    v.innerHTML = `<div class="pad"><div class="card panel"><h2>Nenhum funil cadastrado</h2><p class="muted" style="margin:0">${isAdmin() ? 'Crie o primeiro funil para começar.' : 'Peça a um administrador para criar um funil.'}</p>${isAdmin() ? '<div><button class="btn pri" id="addFun">+ Criar funil</button></div>' : ''}</div></div>`;
    const a = $('#addFun'); if (a) a.onclick = addFunnel; return;
  }
  const F = S.funnels.find(f => f.id === S.fun);
  const ST = stagesOf(F.id);
  const kind = id => (stageById(id) || {}).kind;
  const all = S.leads.filter(l => l.funnel_id === F.id);
  const open = all.filter(l => !kind(l.stage_id));
  const won = all.filter(l => kind(l.stage_id) === 'won');
  const members = S.profiles.filter(p => p.active);
  v.innerHTML = `<div class="kb-top"><div class="kb-tabs">${S.funnels.map(f => `<button class="chip ${S.fun === f.id ? 'on' : ''}" data-fun="${f.id}">${esc(f.name)} <span style="opacity:.7">(${S.leads.filter(l => l.funnel_id === f.id).length})</span></button>`).join('')}${isAdmin() ? '<button class="chip" id="addFun">+ Novo funil</button>' : ''}</div>
      <div class="kb-sum"><span>Em aberto: <b class="num">${open.length}</b></span><span>Potencial: <b class="num">${brl(open.reduce((a, l) => a + Number(l.valor), 0))}</b></span><span>Contratados: <b class="num">${won.length}</b></span></div></div>
    <div class="kb-bar">
      <button class="btn sm ${S.newLead ? 'pri' : ''}" id="tglLead">+ Novo lead</button>
      ${isAdmin() ? `<button class="btn sm ${S.editing ? 'pri' : ''}" id="tglEdit">${S.editing ? 'Concluir edição' : 'Editar funil e etapas'}</button>` : ''}
      <label class="sr" for="kq">Buscar lead</label><input type="search" id="kq" placeholder="Buscar nome, telefone, órgão…" value="${esc(S.q)}">
      <label class="sr" for="kr">Responsável</label><select id="kr"><option value="all">Todos os responsáveis</option><option value="me" ${S.resp === 'me' ? 'selected' : ''}>Meus leads</option><option value="none" ${S.resp === 'none' ? 'selected' : ''}>Sem responsável</option>${members.map(p => `<option value="${p.id}" ${S.resp === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <label class="sr" for="kt">Temperatura</label><select id="kt"><option value="all">Todas as temperaturas</option>${Object.entries(TEMP).map(([k, [, t]]) => `<option value="${k}" ${S.temp === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div id="formArea">${S.newLead ? newLeadForm(F, ST, members) : ''}${S.editing && isAdmin() ? editFunnelForm(F, ST) : ''}</div>
    <div class="board-wrap" id="boardWrap"></div>
    <p class="muted" style="padding:0 24px 24px;margin:0;font-size:12.5px">Arraste os cartões entre as colunas ou use o seletor do cartão. Clique no cartão para abrir a ficha completa.</p>`;
  v.querySelectorAll('[data-fun]').forEach(b => b.onclick = () => { S.fun = b.dataset.fun; ls.set('fun', S.fun); S.editing = false; S.newLead = false; vKanban(v); });
  const af = $('#addFun'); if (af) af.onclick = addFunnel;
  $('#tglLead').onclick = () => { S.newLead = !S.newLead; S.editing = false; vKanban(v); if (S.newLead) setTimeout(() => $('#nlN') && $('#nlN').focus(), 0); };
  const te = $('#tglEdit'); if (te) te.onclick = () => { S.editing = !S.editing; S.newLead = false; vKanban(v); };
  $('#kq').oninput = e => { S.q = e.target.value; paintBoardOnly(); };
  $('#kr').onchange = e => { S.resp = e.target.value; paintBoardOnly(); };
  $('#kt').onchange = e => { S.temp = e.target.value; paintBoardOnly(); };
  if (S.newLead) bindNewLead(F, v);
  if (S.editing && isAdmin()) bindEditFunnel(F, ST, v);
  paintBoardOnly();
}
function paintBoardOnly() {
  const w = $('#boardWrap'); if (!w) return;
  const F = S.funnels.find(f => f.id === S.fun); if (!F) return;
  const ST = stagesOf(F.id), L = filteredLeads();
  w.innerHTML = `<div class="board">${ST.map(s => {
    const C = L.filter(l => l.stage_id === s.id), tot = C.reduce((a, l) => a + Number(l.valor), 0);
    return `<section class="col" aria-label="${esc(s.name)}"><div class="col-h"><i style="background:${esc(s.color)}"></i><b>${esc(s.name)}</b><span class="num">${C.length}</span></div>
      <div class="col-v num">${tot ? brl(tot) : ''}</div>
      <div class="drop" data-st="${s.id}">${C.map(l => { const r = P(l.assigned_to); return `<article class="kc" draggable="true" data-id="${l.id}" tabindex="0">
        <div class="r1"><b>${esc(l.name)}</b><span class="tag ${TEMP[l.temperatura][0]}">${TEMP[l.temperatura][1]}</span></div>
        ${l.cargo || l.orgao ? `<div class="meta">${esc([l.cargo, l.orgao].filter(Boolean).join(' · '))}</div>` : ''}
        ${l.origem ? `<div class="meta">Origem: ${esc(l.origem)}</div>` : ''}
        <div class="r3">${r ? `<span class="mini" style="background:${esc(r.color)}" title="${esc(r.name)}">${esc(ini(r.name))}</span>` : '<span class="mini" style="background:var(--faint)" title="Sem responsável">?</span>'}
          <span class="val num">${Number(l.valor) ? brl(l.valor) : ''}</span><span class="age" title="Última atualização">${ago(l.updated_at)}</span>
          <label class="sr" for="mv${l.id}">Mover ${esc(l.name)}</label><select id="mv${l.id}" data-mv="${l.id}" style="width:auto;padding:3px 6px;font-size:11.5px;border-radius:7px">${ST.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      </article>`; }).join('') || '<div class="col-empty">Nenhum lead aqui</div>'}</div></section>`;
  }).join('')}</div>`;
  let dragId = null;
  w.querySelectorAll('.kc').forEach(c => {
    c.ondragstart = e => { dragId = c.dataset.id; c.classList.add('drag'); e.dataTransfer.setData('text/plain', dragId); };
    c.ondragend = () => c.classList.remove('drag');
    c.onclick = e => { if (e.target.closest('select')) return; openDrawer(c.dataset.id); };
    c.onkeydown = e => { if (e.key === 'Enter' && e.target === c) openDrawer(c.dataset.id); };
  });
  w.querySelectorAll('.drop').forEach(d => {
    d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); moveLead(dragId || e.dataTransfer.getData('text/plain'), d.dataset.st); };
  });
  w.querySelectorAll('[data-mv]').forEach(s => { s.onclick = e => e.stopPropagation(); s.onchange = () => moveLead(s.dataset.mv, s.value); });
}
async function moveLead(id, stageId) {
  const l = S.leads.find(x => x.id === id); if (!l || l.stage_id === stageId) return;
  const prev = l.stage_id; l.stage_id = stageId; l.updated_at = new Date().toISOString(); paintBoardOnly();
  const { error } = await sb.from('leads').update({ stage_id: stageId }).eq('id', id);
  if (error) { l.stage_id = prev; paintBoardOnly(); return fail(error, 'Não foi possível mover'); }
  toast(`${l.name.split(' ')[0]} → ${(stageById(stageId) || {}).name || ''}`);
}

/* ---- Novo lead ---- */
function newLeadForm(F, ST, members) {
  return `<section class="card panel ed"><h2>Novo lead em "${esc(F.name)}"</h2>
    <div class="row"><div class="field"><label for="nlN">Nome *</label><input type="text" id="nlN" autocomplete="off"></div><div class="field"><label for="nlW">WhatsApp</label><input type="tel" id="nlW" placeholder="(12) 99999-0000"></div></div>
    <div class="row"><div class="field"><label for="nlC">Cargo</label><input type="text" id="nlC" placeholder="Ex.: Professora PEB II"></div><div class="field"><label for="nlO">Órgão</label><input type="text" id="nlO" placeholder="Ex.: Rede estadual SP"></div><div class="field"><label for="nlTs">Tempo de serviço</label><input type="text" id="nlTs" placeholder="Ex.: 12 anos"></div></div>
    <div class="row"><div class="field"><label for="nlS">Origem</label><select id="nlS">${ORIGENS.map(o => `<option>${o}</option>`).join('')}</select></div>
      <div class="field"><label for="nlE">Etapa</label><select id="nlE">${ST.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="nlT">Temperatura</label><select id="nlT"><option value="warm">Morno</option><option value="hot">Quente</option><option value="cold">Frio</option></select></div></div>
    <div class="row"><div class="field"><label for="nlR">Responsável</label><select id="nlR"><option value="">Sem responsável</option>${members.map(p => `<option value="${p.id}" ${p.id === S.me.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="nlV">Valor estimado (R$)</label><input type="text" id="nlV" inputmode="numeric" placeholder="0"></div></div>
    <div class="field"><label for="nlSu">Resumo do caso</label><textarea id="nlSu" rows="3" placeholder="O que o lead relatou, documentos que possui, prazos…"></textarea></div>
    <div class="row"><button class="btn pri" id="nlSave">Adicionar ao funil</button><button class="btn" id="nlCancel">Cancelar</button></div></section>`;
}
function bindNewLead(F, v) {
  $('#nlCancel').onclick = () => { S.newLead = false; vKanban(v); };
  $('#nlSave').onclick = async e => {
    const name = $('#nlN').value.trim(); if (!name) { toast('Informe o nome do lead.', true); $('#nlN').focus(); return; }
    const btn = e.currentTarget; btn.disabled = true;
    const row = { funnel_id: F.id, stage_id: $('#nlE').value, name, phone: $('#nlW').value.trim(), cargo: $('#nlC').value.trim(), orgao: $('#nlO').value.trim(), tempo_servico: $('#nlTs').value.trim(),
      origem: $('#nlS').value, temperatura: $('#nlT').value, assigned_to: $('#nlR').value || null, valor: parseFloat(($('#nlV').value || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0, summary: $('#nlSu').value.trim() };
    const { data, error } = await sb.from('leads').insert(row).select().single();
    btn.disabled = false;
    if (error) return fail(error, 'Não foi possível salvar');
    S.leads.unshift(data); S.newLead = false; vKanban(v); toast('Lead adicionado.');
  };
}

/* ---- Editar funil (administradores) ---- */
function editFunnelForm(F, ST) {
  return `<section class="card panel ed">
    <div class="sec-h"><h2>Configurar funil</h2><button class="btn sm" id="delFun" ${S.funnels.length < 2 ? 'disabled title="O sistema precisa de pelo menos um funil"' : ''}>Excluir funil</button></div>
    <div class="row"><div class="field"><label for="fName">Nome do funil</label><input type="text" id="fName" value="${esc(F.name)}"></div><div class="field"><label for="fHint">Descrição curta</label><input type="text" id="fHint" value="${esc(F.hint)}"></div>
      <button class="btn" id="fSave">Salvar nome</button></div>
    <div class="field"><label>Etapas (da esquerda para a direita)</label><div class="stl">${ST.map((s, i) => `<div class="st-row">
      <label class="sr" for="sc${i}">Cor da etapa ${i + 1}</label><input type="color" id="sc${i}" data-sc="${s.id}" value="${esc(s.color)}">
      <label class="sr" for="sn${i}">Nome da etapa ${i + 1}</label><input type="text" id="sn${i}" data-sn="${s.id}" value="${esc(s.name)}">
      <label class="sr" for="sk${i}">Tipo da etapa ${i + 1}</label><select id="sk${i}" data-sk="${s.id}"><option value="">Em andamento</option><option value="won" ${s.kind === 'won' ? 'selected' : ''}>Ganho</option><option value="lost" ${s.kind === 'lost' ? 'selected' : ''}>Perdido</option></select>
      <button class="ib" data-up="${i}" aria-label="Mover para a esquerda" ${i ? '' : 'disabled'}>↑</button><button class="ib" data-dn="${i}" aria-label="Mover para a direita" ${i < ST.length - 1 ? '' : 'disabled'}>↓</button>
      <button class="ib" data-del="${s.id}" aria-label="Excluir etapa ${esc(s.name)}" style="color:var(--red)">×</button></div>`).join('')}</div></div>
    <div class="row"><button class="btn sm" id="addSt">+ Adicionar etapa</button></div>
    <small class="muted">As alterações são salvas na hora e valem para toda a equipe. Ao excluir uma etapa, os leads dela vão para a primeira etapa do funil. Etapas do tipo "Ganho" e "Perdido" não entram no valor em aberto.</small></section>`;
}
async function renumber(fid, ordered) {
  const list = ordered || stagesOf(fid);
  const res = await Promise.all(list.map((s, i) => s.position === i + 1 ? null : sb.from('stages').update({ position: i + 1 }).eq('id', s.id)));
  const bad = res.find(r => r && r.error); if (bad) throw bad.error;
  list.forEach((s, i) => s.position = i + 1);
}
function bindEditFunnel(F, ST, v) {
  const redo = () => vKanban(v);
  $('#fSave').onclick = async () => {
    const name = $('#fName').value.trim() || 'Funil sem nome', hint = $('#fHint').value.trim();
    const { error } = await sb.from('funnels').update({ name, hint }).eq('id', F.id); if (error) return fail(error);
    F.name = name; F.hint = hint; redo(); toast('Funil atualizado.');
  };
  v.querySelectorAll('[data-sn]').forEach(i => i.onchange = async () => {
    const s = stageById(i.dataset.sn), name = i.value.trim() || 'Etapa';
    const { error } = await sb.from('stages').update({ name }).eq('id', s.id); if (error) return fail(error);
    s.name = name; paintBoardOnly(); toast('Etapa renomeada.');
  });
  v.querySelectorAll('[data-sc]').forEach(i => i.onchange = async () => {
    const s = stageById(i.dataset.sc);
    const { error } = await sb.from('stages').update({ color: i.value }).eq('id', s.id); if (error) return fail(error);
    s.color = i.value; paintBoardOnly();
  });
  v.querySelectorAll('[data-sk]').forEach(i => i.onchange = async () => {
    const s = stageById(i.dataset.sk), kind = i.value || null;
    const { error } = await sb.from('stages').update({ kind }).eq('id', s.id); if (error) return fail(error);
    s.kind = kind; redo();
  });
  const swap = async (a, b) => {
    const list = ST.slice(); [list[a], list[b]] = [list[b], list[a]];
    try { await renumber(F.id, list); redo(); } catch (e) { fail(e); await loadMeta(); redo(); }
  };
  v.querySelectorAll('[data-up]').forEach(b => b.onclick = () => swap(+b.dataset.up - 1, +b.dataset.up));
  v.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => swap(+b.dataset.dn, +b.dataset.dn + 1));
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const s = stageById(b.dataset.del);
    if (ST.length < 2) return toast('O funil precisa de pelo menos uma etapa.', true);
    const n = S.leads.filter(l => l.stage_id === s.id).length;
    const target = ST.find(x => x.id !== s.id);
    if (!confirm2('st' + s.id, b, n ? `${n} lead(s) irão para "${target.name}". Clique de novo para confirmar.` : 'Clique de novo para excluir a etapa.')) return;
    try {
      if (n) { const r = await sb.from('leads').update({ stage_id: target.id }).eq('stage_id', s.id); if (r.error) throw r.error; }
      const d = await sb.from('stages').delete().eq('id', s.id); if (d.error) throw d.error;
      await loadMeta(); await loadLeads(); await renumber(F.id); redo(); toast('Etapa excluída.');
    } catch (e) { fail(e); }
  });
  $('#addSt').onclick = async () => {
    const firstClosed = ST.findIndex(s => s.kind);
    try {
      const { data, error } = await sb.from('stages').insert({ funnel_id: F.id, name: 'Nova etapa', color: '#1D5F78', position: 999 }).select().single();
      if (error) throw error;
      S.stages.push(data);
      const list = ST.slice(); list.splice(firstClosed < 0 ? list.length : firstClosed, 0, data);
      await renumber(F.id, list); redo();
      const inp = v.querySelector(`[data-sn="${data.id}"]`); if (inp) inp.select();
    } catch (e) { fail(e); }
  };
  $('#delFun').onclick = async e => {
    if (S.funnels.length < 2) return;
    const other = S.funnels.find(f => f.id !== F.id), firstSt = stagesOf(other.id)[0];
    const n = S.leads.filter(l => l.funnel_id === F.id).length;
    if (!firstSt && n) return toast(`O funil "${other.name}" não tem etapas para receber os leads.`, true);
    if (!confirm2('fun' + F.id, e.currentTarget, n ? `${n} lead(s) irão para "${other.name}". Clique de novo para confirmar.` : 'Clique de novo para excluir o funil.')) return;
    try {
      if (n) { const r = await sb.from('leads').update({ funnel_id: other.id, stage_id: firstSt.id }).eq('funnel_id', F.id); if (r.error) throw r.error; }
      const d = await sb.from('funnels').delete().eq('id', F.id); if (d.error) throw d.error;
      S.fun = other.id; ls.set('fun', S.fun); S.editing = false;
      await loadMeta(); await loadLeads(); redo(); toast('Funil excluído.');
    } catch (err) { fail(err); }
  };
}
async function addFunnel() {
  try {
    const pos = Math.max(0, ...S.funnels.map(f => f.position)) + 1;
    const { data, error } = await sb.from('funnels').insert({ name: 'Novo funil', hint: '', position: pos }).select().single();
    if (error) throw error;
    const def = [['Novo lead', '#86979E', null], ['Triagem', '#C59A3D', null], ['Qualificado', '#1D5F78', null], ['Reunião agendada', '#0E3B4F', null], ['Proposta enviada', '#A86A00', null], ['Contratado', '#1E7A4F', 'won'], ['Perdido', '#B3261E', 'lost']];
    const r = await sb.from('stages').insert(def.map(([name, color, kind], i) => ({ funnel_id: data.id, name, color, kind, position: i + 1 })));
    if (r.error) throw r.error;
    await loadMeta(); S.fun = data.id; ls.set('fun', S.fun); S.editing = true; S.newLead = false;
    vKanban($('#view')); setTimeout(() => { const n = $('#fName'); if (n) n.select(); }, 0);
    toast('Funil criado. Dê um nome a ele e clique em "Salvar nome".');
  } catch (e) { fail(e, 'Não foi possível criar o funil'); }
}

/* =====================================================================
   FICHA DO LEAD (gaveta lateral)
   ===================================================================== */
async function openDrawer(id) {
  S.openLead = id; S.notes = []; paintDrawer();
  try { await loadNotes(id); paintNotes(); } catch (e) { fail(e); }
}
function closeDrawer() { S.openLead = null; const d = $('#drawer'); if (d) d.innerHTML = ''; }
function paintDrawer() {
  const l = S.leads.find(x => x.id === S.openLead), d = $('#drawer'); if (!l || !d) return closeDrawer();
  const ST = stagesOf(l.funnel_id), members = S.profiles.filter(p => p.active || p.id === l.assigned_to), wa = waLink(l.phone);
  const st = stageById(l.stage_id) || {};
  d.innerHTML = `<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-label="Ficha de ${esc(l.name)}">
    <div class="dr-h"><span class="pp" style="background:var(--pet-2)">${esc(ini(l.name))}</span><b>${esc(l.name)}</b><span class="tag ${TEMP[l.temperatura][0]}">${TEMP[l.temperatura][1]}</span><button class="ib" id="drX" aria-label="Fechar"><svg><use href="#i-x"/></svg></button></div>
    <form class="dr-b" id="lf">
      <div class="row">${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>Abrir no WhatsApp</a>` : '<span class="muted" style="font-size:12.5px">Cadastre o WhatsApp para abrir a conversa com um clique.</span>'}</div>
      <div class="row"><div class="field"><label for="lN">Nome</label><input type="text" id="lN" value="${esc(l.name)}" required></div><div class="field"><label for="lW">WhatsApp</label><input type="tel" id="lW" value="${esc(l.phone)}"></div></div>
      <div class="row"><div class="field"><label for="lF">Funil</label><select id="lF">${S.funnels.map(f => `<option value="${f.id}" ${f.id === l.funnel_id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="lS">Etapa</label><select id="lS">${ST.map(s => `<option value="${s.id}" ${s.id === l.stage_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label for="lR">Responsável</label><select id="lR"><option value="">Sem responsável</option>${members.map(p => `<option value="${p.id}" ${p.id === l.assigned_to ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="lT">Temperatura</label><select id="lT">${Object.entries(TEMP).map(([k, [, t]]) => `<option value="${k}" ${l.temperatura === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label for="lC">Cargo</label><input type="text" id="lC" value="${esc(l.cargo)}"></div><div class="field"><label for="lO">Órgão</label><input type="text" id="lO" value="${esc(l.orgao)}"></div></div>
      <div class="row"><div class="field"><label for="lTs">Tempo de serviço</label><input type="text" id="lTs" value="${esc(l.tempo_servico)}"></div>
        <div class="field"><label for="lOr">Origem</label><select id="lOr">${(ORIGENS.includes(l.origem) || !l.origem ? ORIGENS : [l.origem].concat(ORIGENS)).map(o => `<option ${o === l.origem ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="field"><label for="lV">Valor estimado (R$)</label><input type="text" id="lV" inputmode="numeric" value="${Number(l.valor) || ''}"></div></div>
      <div class="field"><label for="lSu">Resumo do caso</label><textarea id="lSu" rows="4">${esc(l.summary)}</textarea></div>
      <div class="field" id="lostBox" ${st.kind === 'lost' ? '' : 'hidden'}><label for="lLr">Motivo da perda</label><select id="lLr"><option value="">Selecione</option>${['Fora do perfil', 'Sem documentos', 'Valor dos honorários', 'Parou de responder', 'Já tem advogado', 'Desistiu', 'Outro'].map(o => `<option ${o === l.lost_reason ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="row"><button class="btn pri" id="lSave">Salvar alterações</button></div>
      <div class="dr-sec">Histórico</div>
      <div class="field"><label for="nt" class="sr">Nova anotação</label><textarea id="nt" rows="2" placeholder="Registre um contato, documento recebido, combinado…"></textarea><div><button type="button" class="btn sm" id="ntAdd">Adicionar anotação</button></div></div>
      <div class="tl" id="tl"><div class="muted" style="font-size:12.5px">Carregando histórico…</div></div>
      <small class="muted">Cadastrado em ${dt(l.created_at)} · atualizado ${ago(l.updated_at)}</small>
    </form>
    <div class="dr-f"><button class="btn" id="drClose">Fechar</button>${isAdmin() ? '<button class="btn danger" id="lDel">Excluir lead</button>' : ''}</div></aside>`;
  $('#scrim').onclick = closeDrawer; $('#drX').onclick = closeDrawer; $('#drClose').onclick = closeDrawer;
  document.onkeydown = e => { if (e.key === 'Escape' && S.openLead) closeDrawer(); };
  $('#lF').onchange = e => { const sts = stagesOf(e.target.value); $('#lS').innerHTML = sts.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''); $('#lostBox').hidden = !(sts[0] && sts[0].kind === 'lost'); };
  $('#lS').onchange = e => { $('#lostBox').hidden = (stageById(e.target.value) || {}).kind !== 'lost'; };
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const name = $('#lN').value.trim(); if (!name) return toast('O nome não pode ficar vazio.', true);
    const upd = { name, phone: $('#lW').value.trim(), funnel_id: $('#lF').value, stage_id: $('#lS').value, assigned_to: $('#lR').value || null, temperatura: $('#lT').value,
      cargo: $('#lC').value.trim(), orgao: $('#lO').value.trim(), tempo_servico: $('#lTs').value.trim(), origem: $('#lOr').value,
      valor: parseFloat(String($('#lV').value || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0, summary: $('#lSu').value.trim(),
      lost_reason: (stageById($('#lS').value) || {}).kind === 'lost' ? $('#lLr').value : '' };
    const btn = $('#lSave'); btn.disabled = true;
    const { data, error } = await sb.from('leads').update(upd).eq('id', l.id).select().single();
    btn.disabled = false;
    if (error) return fail(error, 'Não foi possível salvar');
    Object.assign(l, data); toast('Lead atualizado.'); refresh(); paintDrawer(); loadNotes(l.id).then(paintNotes).catch(() => {});
  };
  $('#ntAdd').onclick = async () => {
    const body = $('#nt').value.trim(); if (!body) return;
    const { error } = await sb.from('lead_notes').insert({ lead_id: l.id, body, author: S.me.id, kind: 'note' });
    if (error) return fail(error, 'Não foi possível anotar');
    $('#nt').value = ''; await loadNotes(l.id); paintNotes(); toast('Anotação registrada.');
  };
  const del = $('#lDel'); if (del) del.onclick = async e => {
    if (!confirm2('del' + l.id, e.currentTarget, 'O lead e todo o histórico serão apagados. Clique de novo para confirmar.')) return;
    const { error } = await sb.from('leads').delete().eq('id', l.id); if (error) return fail(error);
    S.leads = S.leads.filter(x => x.id !== l.id); closeDrawer(); refresh(); toast('Lead excluído.');
  };
  paintNotes();
}
function paintNotes() {
  const tl = $('#tl'); if (!tl) return;
  if (!S.notes.length) { tl.innerHTML = '<div class="muted" style="font-size:12.5px">Sem registros ainda.</div>'; return; }
  tl.innerHTML = S.notes.map(n => { const a = P(n.author);
    return `<div class="tl-i ${n.kind === 'system' ? 'sys' : ''}">${n.kind === 'note' ? `<span class="mini" style="background:${esc(a ? a.color : '#86979E')}" title="${esc(a ? a.name : '')}">${esc(ini(a ? a.name : '?'))}</span>` : ''}
      <div class="tx">${n.kind === 'note' ? `<b>${esc(a ? a.name : 'Membro removido')}</b><br>` : ''}${esc(n.body)}<small>${dt(n.created_at)}</small></div></div>`; }).join('');
}

/* =====================================================================
   PAINEL
   ===================================================================== */
function vPainel(v) {
  const kind = id => (stageById(id) || {}).kind;
  const since = d => Date.now() - new Date(d).getTime() <= 30 * 86400000;
  const open = S.leads.filter(l => !kind(l.stage_id));
  const new30 = S.leads.filter(l => since(l.created_at));
  const won30 = S.leads.filter(l => kind(l.stage_id) === 'won' && since(l.stage_changed_at));
  const lost30 = S.leads.filter(l => kind(l.stage_id) === 'lost' && since(l.stage_changed_at));
  const conv = (won30.length + lost30.length) ? Math.round(won30.length / (won30.length + lost30.length) * 100) : 0;
  const byF = S.funnels.map(f => [f.name, open.filter(l => l.funnel_id === f.id).length]);
  const mF = Math.max(1, ...byF.map(x => x[1]));
  const orig = {}; S.leads.filter(l => Date.now() - new Date(l.created_at).getTime() <= 90 * 86400000).forEach(l => { const k = l.origem || 'Não informada'; orig[k] = (orig[k] || 0) + 1; });
  const byO = Object.entries(orig).sort((a, b) => b[1] - a[1]); const mO = Math.max(1, ...byO.map(x => x[1]));
  const lost = {}; S.leads.filter(l => kind(l.stage_id) === 'lost').forEach(l => { const k = l.lost_reason || 'Não informado'; lost[k] = (lost[k] || 0) + 1; });
  const byL = Object.entries(lost).sort((a, b) => b[1] - a[1]); const mL = Math.max(1, ...byL.map(x => x[1]));
  const stale = open.filter(l => days(l.updated_at) >= 7).sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at)).slice(0, 12);
  const team = S.profiles.filter(p => p.active);
  const bars = (rows, m, color) => rows.length ? `<div class="hb">${rows.map(([t, n]) => `<div class="hr"><span title="${esc(t)}">${esc(t)}</span><span class="tr"><i style="width:${n / m * 100}%;background:${color}"></i></span><b>${n}</b></div>`).join('')}</div>` : '<div class="empty">Sem dados no período.</div>';
  v.innerHTML = `<div class="pad">
    <div class="kpis">
      <div class="card kpi"><small>Leads em aberto</small><b>${open.length}</b><span>${brl(open.reduce((a, l) => a + Number(l.valor), 0))} em potencial</span></div>
      <div class="card kpi"><small>Novos leads (30 dias)</small><b>${new30.length}</b><span>Cadastrados no período</span></div>
      <div class="card kpi"><small>Contratados (30 dias)</small><b>${won30.length}</b><span>${brl(won30.reduce((a, l) => a + Number(l.valor), 0))} em honorários estimados</span></div>
      <div class="card kpi"><small>Taxa de fechamento</small><b>${conv}%</b><span>Contratados ÷ encerrados (30 dias)</span></div>
    </div>
    <div class="rgrid">
      <section class="card panel"><h2>Leads em aberto por funil</h2>${bars(byF, mF, 'var(--pet)')}</section>
      <section class="card panel"><h2>Origem dos leads (90 dias)</h2>${bars(byO, mO, 'var(--gold)')}</section>
      <section class="card panel"><h2>Motivos de perda</h2>${bars(byL, mL, 'var(--red)')}</section>
      <section class="card panel"><h2>Parados há 7 dias ou mais</h2>${stale.length ? `<div>${stale.map(l => { const r = P(l.assigned_to); return `<div class="list-i"><span class="mini" style="background:${esc(r ? r.color : '#86979E')}">${esc(ini(r ? r.name : '?'))}</span><div class="tx"><b>${esc(l.name)}</b><div class="muted" style="font-size:12px">${esc((S.funnels.find(f => f.id === l.funnel_id) || {}).name || '')} · ${esc((stageById(l.stage_id) || {}).name || '')}</div></div><span class="tag t-warm">${ago(l.updated_at)}</span><button class="btn sm" data-open="${l.id}">Abrir</button></div>`; }).join('')}</div>` : '<div class="empty">Nenhum lead parado. Ótimo trabalho.</div>'}</section>
      <section class="card panel" style="grid-column:1/-1"><h2>Desempenho por responsável</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Responsável</th><th>Em aberto</th><th>Valor em aberto</th><th>Contratados (30d)</th><th>Perdidos (30d)</th></tr></thead><tbody>
        ${team.map(p => { const o = open.filter(l => l.assigned_to === p.id); return `<tr><td><span class="mini" style="background:${esc(p.color)};display:inline-grid;margin-right:8px;vertical-align:middle">${esc(ini(p.name))}</span>${esc(p.name)}</td><td>${o.length}</td><td>${brl(o.reduce((a, l) => a + Number(l.valor), 0))}</td><td>${won30.filter(l => l.assigned_to === p.id).length}</td><td>${lost30.filter(l => l.assigned_to === p.id).length}</td></tr>`; }).join('')}
        <tr><td>Sem responsável</td><td>${open.filter(l => !l.assigned_to).length}</td><td>${brl(open.filter(l => !l.assigned_to).reduce((a, l) => a + Number(l.valor), 0))}</td><td>—</td><td>—</td></tr></tbody></table></div></section>
    </div></div>`;
  v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDrawer(b.dataset.open));
}

/* =====================================================================
   EQUIPE
   ===================================================================== */
let editMember = null;
function vEquipe(v) {
  const adm = isAdmin();
  const pending = S.profiles.filter(p => !p.active), active = S.profiles.filter(p => p.active);
  const link = location.origin + location.pathname;
  const card = p => {
    const openN = S.leads.filter(l => l.assigned_to === p.id && !(stageById(l.stage_id) || {}).kind).length;
    if (editMember === p.id && adm) return `<article class="card tm">
      <div class="field"><label for="em-n">Nome de exibição</label><input type="text" id="em-n" value="${esc(p.name)}"></div>
      <div class="row"><div class="field"><label for="em-r">Função</label><select id="em-r">${(ROLES.includes(p.role_label) ? ROLES : [p.role_label].concat(ROLES)).map(r => `<option ${r === p.role_label ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
        <div class="field" style="flex:0 0 auto;min-width:0"><label for="em-c">Cor</label><input type="color" id="em-c" value="${esc(p.color)}"></div></div>
      <div class="field"><label for="em-p">Permissão</label><select id="em-p"><option value="atendente" ${p.perm !== 'admin' ? 'selected' : ''}>Atendente: usa funis e leads</option><option value="admin" ${p.perm === 'admin' ? 'selected' : ''}>Administrador: também configura funis e equipe</option></select></div>
      <div class="field"><label for="em-a">Acesso</label><select id="em-a"><option value="1" ${p.active ? 'selected' : ''}>Liberado</option><option value="0" ${!p.active ? 'selected' : ''}>Bloqueado</option></select></div>
      <div class="row"><button class="btn pri" id="em-s">Salvar</button><button class="btn" id="em-x">Cancelar</button></div></article>`;
    return `<article class="card tm"><div class="tm-h"><span class="pp" style="background:${esc(p.color)}">${esc(ini(p.name))}</span><div><b>${esc(p.name)} ${p.id === S.me.id ? '<span class="tag t-ok">Você</span>' : ''}</b><span>${esc(p.role_label)}</span></div></div>
      <dl class="kv"><dt>E-mail</dt><dd title="${esc(p.email)}">${esc(p.email || '—')}</dd><dt>Permissão</dt><dd>${p.perm === 'admin' ? 'Administrador' : 'Atendente'}</dd><dt>Status</dt><dd>${p.active ? '<span class="tag t-ok">Liberado</span>' : '<span class="tag t-warm">Aguardando / bloqueado</span>'}</dd><dt>Leads em aberto</dt><dd class="num">${openN}</dd></dl>
      ${adm ? `<div class="row">${!p.active ? `<button class="btn pri sm" data-approve="${p.id}">Aprovar acesso</button>` : ''}<button class="btn sm" data-edit="${p.id}">Editar</button></div>` : ''}</article>`;
  };
  v.innerHTML = `<div class="pad">
    <section class="card panel"><h2>Como incluir alguém na equipe</h2>
      <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px">
        <li>Envie para a pessoa o endereço do sistema: <b id="lnk" style="word-break:break-all">${esc(link)}</b> <button class="btn sm" id="cp">Copiar</button></li>
        <li>Ela clica em <b>Criar conta</b>, informa o nome de exibição (que aparecerá nos atendimentos), e-mail e senha, e confirma o e-mail.</li>
        <li>${adm ? 'A conta aparece aqui em <b>Aguardando aprovação</b>. Clique em <b>Aprovar acesso</b> e defina a função e a permissão.' : 'Um administrador aprova o acesso nesta tela.'}</li>
      </ol></section>
    ${adm && pending.length ? `<section style="display:flex;flex-direction:column;gap:12px"><h2>Aguardando aprovação ou bloqueados (${pending.length})</h2><div class="team-grid">${pending.map(card).join('')}</div></section>` : ''}
    <section style="display:flex;flex-direction:column;gap:12px"><h2>Equipe ativa (${active.length})</h2><div class="team-grid">${active.map(card).join('')}</div></section></div>`;
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Endereço copiado.'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#lnk')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selecione e copie o endereço.'); } };
  v.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('profiles').update({ active: true }).eq('id', b.dataset.approve); if (error) return fail(error);
    await loadMeta(); renderShell(); toast('Acesso liberado.');
  });
  v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editMember = b.dataset.edit; vEquipe(v); });
  const es = $('#em-s'); if (es) {
    $('#em-x').onclick = () => { editMember = null; vEquipe(v); };
    es.onclick = async () => {
      const upd = { name: $('#em-n').value.trim() || 'Sem nome', role_label: $('#em-r').value, color: $('#em-c').value, perm: $('#em-p').value, active: $('#em-a').value === '1' };
      const { error } = await sb.from('profiles').update(upd).eq('id', editMember); if (error) return fail(error, 'Não foi possível salvar');
      editMember = null; await loadMeta(); if (!isAdmin()) S.route = 'kanban'; renderShell(); toast('Membro atualizado.');
    };
  }
}

/* =====================================================================
   MEU PERFIL
   ===================================================================== */
function vPerfil(v) {
  v.innerHTML = `<div class="pad" style="max-width:720px">
    <section class="card panel"><h2>Meus dados</h2>
      <div class="row"><div class="field"><label for="pn">Nome de exibição</label><input type="text" id="pn" value="${esc(S.me.name)}"><small>É assim que seu nome aparece para a equipe e nos atendimentos.</small></div>
        <div class="field" style="flex:0 0 auto;min-width:0"><label for="pc">Cor</label><input type="color" id="pc" value="${esc(S.me.color)}"></div></div>
      <dl class="kv"><dt>E-mail</dt><dd>${esc(S.me.email)}</dd><dt>Função</dt><dd>${esc(S.me.role_label)}</dd><dt>Permissão</dt><dd>${S.me.perm === 'admin' ? 'Administrador' : 'Atendente'}</dd></dl>
      <div><button class="btn pri" id="ps">Salvar</button></div></section>
    <section class="card panel"><h2>Alterar senha</h2>
      <div class="field"><label for="pw">Nova senha</label><input type="password" id="pw" autocomplete="new-password"><small>Mínimo de 8 caracteres.</small></div>
      <div><button class="btn" id="pws">Atualizar senha</button></div></section>
    <section class="card panel"><h2>Sessão</h2><div><button class="btn" id="pso"><svg><use href="#i-out"/></svg>Sair do sistema</button></div></section></div>`;
  $('#ps').onclick = async () => {
    const name = $('#pn').value.trim(); if (!name) return toast('Informe o nome.', true);
    const { error } = await sb.from('profiles').update({ name, color: $('#pc').value }).eq('id', S.me.id); if (error) return fail(error);
    await loadMeta(); renderShell(); toast('Dados atualizados.');
  };
  $('#pws').onclick = async () => {
    const pw = $('#pw').value; if (pw.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', true);
    const { error } = await sb.auth.updateUser({ password: pw }); if (error) return fail(error);
    $('#pw').value = ''; toast('Senha atualizada.');
  };
  $('#pso').onclick = () => sb.auth.signOut();
}
})();
