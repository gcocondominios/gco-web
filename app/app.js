/**
 * GCO Gestión de Condominios — Frontend SPA
 * Conecta con Google Apps Script Web App y gestiona vistas, sesión,
 * modales deslizantes (bottom sheets) y compresión de imágenes en cliente.
 */

(function () {
  'use strict';

  // REEMPLAZAR CON LA URL DE TU WEB APP DE GOOGLE APPS SCRIPT DESPLEGADA
  const API_URL = 'https://script.google.com/macros/s/AKfycbw_hB2YcR0HZeOVRY_ss7egIQWqATVgZe3RtJXXvsY-ZvsYFVjUgInhJNN1I9EKYT0aTA/exec';

  const STORAGE_KEY = 'gco_session_v1';
  const QUEUE_KEY = 'gco_offline_queue_v1';
  const LAST_EDIF_KEY = 'gco_last_edificio_v1';

  const state = {
    edificioId: '',
    equipoId: '',
    data: null,
    session: loadSession(),
    reportCategory: 'Ruido inusual',
    reportPhotos: [],
    quickAuthMode: 'login',
    authMode: 'login',
    maintType: 'Preventiva',
    maintState: 'Operativo',
    maintFiles: [],
    rondaState: 'Conforme',
    rondaChecks: [],
    rondaPhotos: [],
    rondaItems: [],
    rondaEditingIdx: -1,
    rondaSavedToDrive: false,
    rondaStateTouched: false,
    rondaOrderTouched: false,
    rondaTotalAreas: 0,
    lastRondaPdf: null,
  };

  document.addEventListener('DOMContentLoaded', function () {
    registerServiceWorker();
    bindEvents();
    updateSessionUI();
    updateOfflineBanner();
    readUrlAndLoad();

    window.addEventListener('popstate', function () {
      readUrlAndLoad();
    });
    window.addEventListener('online', function () {
      updateOfflineBanner();
      syncOfflineQueue();
      syncPendingRondaPhotos();
    });
    window.addEventListener('offline', updateOfflineBanner);

    if (navigator.onLine) {
      syncOfflineQueue();
    }
  });

  function readUrlAndLoad() {
    const params = new URLSearchParams(window.location.search);
    const paramEdificio = (params.get('edificio') || '').trim();
    state.equipoId = (params.get('equipo') || '').trim();
    const user = state.session && state.session.user ? state.session.user : null;

    if (user && user.rol === 'comite' && user.edificioId && user.edificioId.toUpperCase() !== 'ALL') {
      state.edificioId = user.edificioId;
    } else if (user && user.rol === 'tecnico' && user.edificioId && user.edificioId.toUpperCase() !== 'ALL') {
      state.edificioId = paramEdificio || user.edificioId;
      if (!state.equipoId) {
        showErrorState('Escanea el código QR del equipo asignado a tu especialidad para registrar tu mantención.');
        updateSessionUI();
        return;
      }
    } else if (user && user.rol === 'operaciones') {
      if (paramEdificio && paramEdificio.toUpperCase() !== 'DEMO') {
        state.edificioId = paramEdificio;
        try { localStorage.setItem(LAST_EDIF_KEY, paramEdificio); } catch (e) {}
      } else {
        state.edificioId = '';
        updateSessionUI();
        loadOpsHomeView();
        return;
      }
    } else if (paramEdificio) {
      state.edificioId = paramEdificio;
      if (paramEdificio.toUpperCase() !== 'DEMO') {
        try { localStorage.setItem(LAST_EDIF_KEY, paramEdificio); } catch (e) {}
      }
    } else if (user && user.edificioId && user.edificioId.toUpperCase() !== 'ALL') {
      state.edificioId = user.edificioId;
    } else {
      state.edificioId = 'DEMO';
    }

    loadData();
  }

  function saveDataCache(key, payload) {
    try {
      localStorage.setItem('gco_cache_v1_' + key, JSON.stringify({ savedAt: new Date().toISOString(), payload: payload }));
    } catch (e) {}
  }

  function loadDataCache(key) {
    try {
      const raw = localStorage.getItem('gco_cache_v1_' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function loadData() {
    const cacheKey = 'data_' + state.edificioId + '_' + (state.equipoId || 'DIR');
    const cached = loadDataCache(cacheKey);
    if (cached && cached.payload) {
      state.data = cached.payload;
      if (cached.payload.mode === 'equipo') renderEquipoView(cached.payload);
      else renderDirectoryView(cached.payload);
    } else {
      showView('loading');
    }

    const url = new URL(API_URL);
    url.searchParams.set('edificio', state.edificioId);
    if (state.equipoId) {
      url.searchParams.set('equipo', state.equipoId);
    }
    if (state.session && state.session.token) {
      url.searchParams.set('token', state.session.token);
    }

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        if (json.requireAuth) {
          showErrorState(json.error || 'Inicia sesión para ver esta comunidad o escanea el QR del equipo.');
          return;
        }
        if (!cached) showErrorState(json.error || 'No se pudo cargar la información.');
        return;
      }

      saveDataCache(cacheKey, json);
      state.data = json;
      updateOfflineBanner();
      if (json.mode === 'equipo') {
        renderEquipoView(json);
      } else {
        renderDirectoryView(json);
      }
    } catch (err) {
      if (cached && cached.payload) {
        const banner = document.getElementById('offline-banner');
        const text = document.getElementById('offline-banner-text');
        if (banner && text) {
          text.textContent = 'Sin conexión · Mostrando datos guardados (' + formatShortDate(cached.savedAt) + ')';
          banner.classList.remove('hidden');
          banner.classList.add('flex');
        }
      } else {
        showErrorState('Error de conexión con el servidor. Verifica tu internet e intenta nuevamente.');
      }
    }
  }

  function showView(name) {
    const views = ['loading', 'error', 'ops-home', 'equipment', 'directory'];
    views.forEach(function (v) {
      const el = document.getElementById('view-' + v);
      if (!el) return;
      el.classList.toggle('hidden', v !== name);
      el.classList.toggle('flex', v === name);
    });

    const btnReport = document.getElementById('btn-open-report');
    const btnBack = document.getElementById('btn-back-directory');
    if (btnReport) {
      btnReport.classList.toggle('hidden', name !== 'equipment');
      btnReport.classList.toggle('inline-flex', name === 'equipment');
    }
    if (btnBack) {
      const isDemoPublic = String(state.edificioId || '').toUpperCase() === 'DEMO';
      const canSeeDir = isDemoPublic || Boolean(state.session && state.session.user && ['operaciones', 'admin', 'comite'].indexOf(state.session.user.rol) !== -1);
      const showBack = name === 'equipment' && canSeeDir;
      btnBack.classList.toggle('hidden', !showBack);
      btnBack.classList.toggle('inline-flex', showBack);
    }
  }

  async function loadOpsHomeView() {
    const greet = document.getElementById('ops-home-greeting');
    const user = state.session && state.session.user ? state.session.user : null;
    if (greet && user && user.nombre) {
      greet.textContent = 'Hola ' + user.nombre.split(' ')[0] + ' · Elige tu comunidad';
    }
    const headerName = document.getElementById('header-building-name');
    if (headerName) headerName.textContent = 'Operaciones';

    showView('ops-home');

    const cached = loadDataCache('ops_home');
    if (cached && cached.payload) {
      renderOpsHomeBuildings(cached.payload);
    }

    if (!state.session || !state.session.token) return;
    try {
      const url = new URL(API_URL);
      url.searchParams.set('action', 'adminData');
      url.searchParams.set('token', state.session.token);
      url.searchParams.set('edificio', '');
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (json && json.ok) {
        saveDataCache('ops_home', json);
        renderOpsHomeBuildings(json);
      }
    } catch (e) {
      if (!cached) {
        const list = document.getElementById('ops-buildings-list');
        if (list) list.innerHTML = '<p class="font-body text-body-sm text-error">Sin conexión. Abre el Panel de Operaciones arriba o revisa tu señal.</p>';
      }
    }
  }

  function renderOpsHomeBuildings(json) {
    const list = document.getElementById('ops-buildings-list');
    if (!list) return;

    let lastId = '';
    try { lastId = localStorage.getItem(LAST_EDIF_KEY) || ''; } catch (e) {}

    const ccList = (json.controlCenter && Array.isArray(json.controlCenter.porComunidad) && json.controlCenter.porComunidad.length > 0)
      ? json.controlCenter.porComunidad.slice()
      : (json.edificios || []).map(function (ed) {
          return { id: ed.id, nombre: ed.nombre, equipos: 0, atrasadas: 0, ticketsAbiertos: 0, ordenesAbiertas: 0 };
        });

    if (ccList.length === 0) {
      list.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">No hay comunidades reales asignadas aún.</p>';
      return;
    }

    // Poner la última comunidad visitada arriba para acceso en 1 toque
    ccList.sort(function (a, b) {
      const aLast = lastId && a.id.toLowerCase() === lastId.toLowerCase() ? 1 : 0;
      const bLast = lastId && b.id.toLowerCase() === lastId.toLowerCase() ? 1 : 0;
      if (aLast !== bLast) return bLast - aLast;
      return (b.scoreUrgencia || 0) - (a.scoreUrgencia || 0);
    });

    list.innerHTML = ccList.map(function (c) {
      const isLast = lastId && c.id.toLowerCase() === lastId.toLowerCase();
      const hasAlerts = (c.atrasadas || 0) > 0 || (c.ticketsAbiertos || 0) > 0 || (c.ordenesAbiertas || 0) > 0;
      const dotCls = (c.atrasadas || 0) > 0 ? 'bg-error' : (hasAlerts ? 'bg-warning' : 'bg-success');
      return (
        '<button type="button" data-ops-pick="' + escapeHtml(c.id) + '" class="w-full text-left bg-surface-subtle hover:bg-primary-container/40 rounded-lg border ' + (isLast ? 'border-primary/50' : 'border-outline') + ' p-gutter-md flex items-center justify-between gap-gutter-sm transition-colors duration-state-change active:scale-[0.99]">' +
          '<div class="flex items-start gap-gutter-sm min-w-0">' +
            '<span class="w-2.5 h-2.5 rounded-full ' + dotCls + ' mt-1.5 shrink-0"></span>' +
            '<div class="flex flex-col gap-0.5 min-w-0">' +
              '<div class="flex items-center gap-gutter-xs flex-wrap">' +
                '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(c.nombre) + '</span>' +
                (isLast ? '<span class="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label text-[10px]">Última visita</span>' : '') +
              '</div>' +
              '<span class="font-mono text-[11px] text-on-surface-variant">#' + escapeHtml(c.id) +
                (c.equipos ? ' · ' + c.equipos + ' equipos' : '') +
                ((c.ticketsAbiertos || 0) > 0 ? ' · ' + c.ticketsAbiertos + ' tickets' : '') +
                ((c.ordenesAbiertas || 0) > 0 ? ' · ' + c.ordenesAbiertas + ' órdenes' : '') +
                ((c.atrasadas || 0) > 0 ? ' · ' + c.atrasadas + ' alerta' : '') +
              '</span>' +
            '</div>' +
          '</div>' +
          '<span class="material-symbols-outlined text-[20px] text-primary shrink-0">chevron_right</span>' +
        '</button>'
      );
    }).join('');

    list.querySelectorAll('[data-ops-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-ops-pick');
        if (!targetId) return;
        state.edificioId = targetId;
        state.equipoId = '';
        try { localStorage.setItem(LAST_EDIF_KEY, targetId); } catch (e) {}
        const url = new URL(window.location.href);
        url.searchParams.set('edificio', targetId);
        url.searchParams.delete('equipo');
        window.history.pushState({}, '', url.toString());
        loadData();
      });
    });
  }

  function showErrorState(msg) {
    document.getElementById('header-building-name').textContent = state.edificioId || 'GCO App';
    document.getElementById('error-message').textContent = msg;
    showView('error');
  }

  function renderEquipoView(data) {
    document.title = data.equipo.nombre + ' — GCO Gestión de Condominios';
    document.getElementById('header-building-name').textContent = data.edificio.nombre;
    document.getElementById('eq-name').textContent = data.equipo.nombre;
    document.getElementById('eq-code').textContent = 'Equipo #' + data.equipo.id;

    const specsEl = document.getElementById('eq-specs');
    if (specsEl) {
      const specs = [data.equipo.marca, data.equipo.modelo, data.equipo.numeroSerie ? 'S/N: ' + data.equipo.numeroSerie : ''].filter(Boolean);
      if (specs.length > 0) {
        specsEl.textContent = specs.join(' · ');
        specsEl.classList.remove('hidden');
      } else {
        specsEl.classList.add('hidden');
      }
    }

    document.getElementById('report-eq-subtitle').textContent = data.equipo.nombre + ' · #' + data.equipo.id;
    document.getElementById('maint-eq-subtitle').textContent = data.equipo.nombre + ' · #' + data.equipo.id;

    const iconName = guessEquipmentIcon(data.equipo.nombre, data.equipo.id);
    document.getElementById('eq-icon').textContent = iconName;

    const sem = data.semaforo;
    const pill = document.getElementById('eq-status-pill');
    const pillIcon = document.getElementById('eq-status-icon');
    const pillText = document.getElementById('eq-status-text');
    const eqIconBox = document.getElementById('eq-icon-box');

    pillText.textContent = sem.estadoTexto;

    if (sem.color === 'verde') {
      pill.className = 'inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-full bg-success-container text-on-success-container';
      pillIcon.className = 'material-symbols-outlined text-[16px] text-success';
      pillIcon.textContent = 'check_circle';
      eqIconBox.className = 'w-10 h-10 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center shrink-0';
    } else if (sem.color === 'amarillo') {
      pill.className = 'inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-full bg-warning-container text-on-warning-container';
      pillIcon.className = 'material-symbols-outlined text-[16px] text-warning';
      pillIcon.textContent = 'schedule';
      eqIconBox.className = 'w-10 h-10 rounded-md bg-warning-container text-on-warning-container flex items-center justify-center shrink-0';
    } else if (sem.color === 'gris') {
      pill.className = 'inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-full bg-surface-subtle text-on-surface-variant border border-outline';
      pillIcon.className = 'material-symbols-outlined text-[16px] text-on-surface-variant';
      pillIcon.textContent = 'event_upcoming';
      eqIconBox.className = 'w-10 h-10 rounded-md bg-surface-subtle text-on-surface-variant flex items-center justify-center shrink-0';
    } else {
      pill.className = 'inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-full bg-error-container text-on-error-container';
      pillIcon.className = 'material-symbols-outlined text-[16px] text-error';
      pillIcon.textContent = 'error';
      eqIconBox.className = 'w-10 h-10 rounded-md bg-error-container text-on-error-container flex items-center justify-center shrink-0';
    }

    document.getElementById('eq-last-visit').textContent = formatShortDate(sem.ultimaVisita);
    document.getElementById('eq-company').textContent = data.equipo.empresa;
    document.getElementById('eq-next-visit').textContent = formatShortDate(sem.proximaVisita);

    const btnPdf = document.getElementById('btn-view-pdf');
    const btnPdfLabel = document.getElementById('btn-pdf-label');
    const firstPdf = splitLinks(data.ultimoPdf)[0] || '';
    if (firstPdf) {
      btnPdf.disabled = false;
      btnPdfLabel.textContent = 'Ver Último Informe Técnico (PDF)';
      btnPdf.onclick = function () {
        window.open(firstPdf, '_blank', 'noopener,noreferrer');
      };
    } else {
      btnPdf.disabled = true;
      btnPdfLabel.textContent = 'Sin informe PDF adjunto aún';
      btnPdf.onclick = null;
    }

    renderHistory(data.historial || []);
    renderActiveTickets(data.ticketsActivos || []);
    renderResolvedTickets(data.ticketsResueltos || []);
    renderEquipmentOrders(data.ordenesPendientes || []);

    updateSessionUI();
    showView('equipment');
  }

  function renderEquipmentOrders(orders) {
    const sec = document.getElementById('equipment-orders-section');
    const list = document.getElementById('equipment-orders-list');
    const num = document.getElementById('orders-count-num');
    if (!sec || !list) return;

    const user = state.session ? state.session.user : null;
    const canSee = Boolean(user && (user.rol === 'operaciones' || user.rol === 'admin' || (user.rol === 'tecnico' && canTechEditCurrentEquipment())));
    if (!canSee || !orders || orders.length === 0) {
      sec.classList.add('hidden');
      sec.classList.remove('flex');
      return;
    }

    sec.classList.remove('hidden');
    sec.classList.add('flex');
    num.textContent = String(orders.length);

    list.innerHTML = orders.map(function (o) {
      const urg = o.prioridad.toLowerCase() === 'urgente';
      const badgeCls = urg ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container';
      return (
        '<article class="w-full bg-surface-card rounded-lg border border-outline-subtle border-l-4 ' + (urg ? 'border-l-error' : 'border-l-primary') + ' p-gutter-md shadow-gco flex items-start justify-between gap-gutter-md">' +
          '<div class="flex flex-col gap-gutter-xs min-w-0">' +
            '<div class="flex items-center gap-gutter-xs">' +
              '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-label-sm">' + escapeHtml(o.prioridad) + '</span>' +
              '<span class="font-mono text-mono-sm text-on-surface-variant">' + escapeHtml(o.id) + '</span>' +
            '</div>' +
            '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(o.titulo) + '</span>' +
            (o.detalle ? '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(o.detalle) + '</p>' : '') +
          '</div>' +
          '<button type="button" data-complete-order="' + escapeHtml(o.id) + '" class="px-gutter-md py-gutter-xs rounded-md bg-success-container text-on-success-container font-label text-label-sm shrink-0">Completar</button>' +
        '</article>'
      );
    }).join('');

    list.querySelectorAll('[data-complete-order]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const orderId = btn.getAttribute('data-complete-order');
          const res = await postApi({
            action: 'completeOrder',
            token: state.session.token,
            orderId: orderId,
          });
          if (!res.ok) {
            showToast(res.error || 'No se pudo completar la orden', true);
            return;
          }
          showToast(res.message);
          loadData();
        } finally {
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });
  }

  function renderResolvedTickets(tickets) {
    const wrap = document.getElementById('tickets-resolved-wrap');
    const list = document.getElementById('tickets-resolved-list');
    const title = document.getElementById('tickets-resolved-title');
    if (!wrap || !list) return;

    if (!tickets || tickets.length === 0) {
      wrap.classList.add('hidden');
      return;
    }

    wrap.classList.remove('hidden');
    title.textContent = 'Últimas incidencias resueltas (' + tickets.length + ')';
    list.innerHTML = tickets.map(function (t) {
      const fotosDesp = splitLinks(t.fotoDespuesUrl);
      const fotoHtml = fotosDesp.length > 0
        ? ' · <a href="' + escapeHtml(fotosDesp[0]) + '" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Ver respaldo</a>'
        : '';
      return (
        '<div class="px-gutter-lg py-gutter-md bg-surface-subtle flex flex-col gap-gutter-xs">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(t.descripcion) + '</span>' +
            '<span class="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm shrink-0">Resuelto</span>' +
          '</div>' +
          (t.solucion ? '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(t.solucion) + '</p>' : '') +
          '<span class="font-label text-label-sm text-on-surface-variant">' + escapeHtml(formatShortDate(t.fecha)) + fotoHtml + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderHistory(items) {
    const container = document.getElementById('history-list');
    const countLabel = document.getElementById('history-count-label');
    countLabel.textContent = items.length === 1 ? 'Último registro' : 'Últimos ' + items.length + ' registros';

    if (items.length === 0) {
      container.innerHTML = '<div class="px-gutter-lg py-gutter-md text-body-sm text-on-surface-variant">Aún no hay mantenciones registradas para este equipo.</div>';
      return;
    }

    container.innerHTML = items.map(function (m, idx) {
      const tLow = m.tipo.toLowerCase();
      const isRonda = tLow.indexOf('ronda') !== -1;
      const isCorr = !isRonda && tLow !== 'preventiva' && tLow.indexOf('cert') === -1;
      const iconBg = isCorr ? 'bg-warning-container text-on-warning-container' : 'bg-primary-container text-on-primary-container';
      const iconName = isRonda ? 'fact_check' : (isCorr ? 'handyman' : 'build_circle');
      const pdfLinks = splitLinks(m.linkPdf);
      const pdfLinkHtml = pdfLinks.length > 0
        ? '<div class="flex flex-wrap gap-gutter-sm mt-gutter-sm">' + pdfLinks.map(function (u, j) {
            const lbl = pdfLinks.length === 1 ? 'Ver informe adjunto' : 'Adjunto ' + (j + 1);
            return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-gutter-xs font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>' + lbl + '</a>';
          }).join('') + '</div>'
        : '';

      return (
        '<details class="group"' + (idx === 0 ? ' open' : '') + '>' +
          '<summary class="flex items-center justify-between gap-gutter-md px-gutter-lg py-gutter-md cursor-pointer select-none transition-colors duration-state-change hover:bg-surface-subtle">' +
            '<div class="flex items-center gap-gutter-md min-w-0">' +
              '<div class="w-8 h-8 rounded-md ' + iconBg + ' flex items-center justify-center shrink-0" aria-hidden="true">' +
                '<span class="material-symbols-outlined text-[18px]">' + iconName + '</span>' +
              '</div>' +
              '<div class="flex flex-col gap-gutter-xs min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface truncate">Mantención ' + escapeHtml(m.tipo) + '</span>' +
                '<span class="font-label text-label-md text-on-surface-variant tabular-nums">' + escapeHtml(formatShortDate(m.fecha)) + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="material-symbols-outlined text-[20px] text-on-surface-variant transition-transform duration-accordion-toggle ease-accordion-toggle group-open:rotate-180 shrink-0" aria-hidden="true">expand_more</span>' +
          '</summary>' +
          '<div class="px-gutter-lg pb-gutter-md pt-gutter-sm bg-surface-subtle border-t border-outline-subtle">' +
            '<p class="font-body text-body-sm text-on-surface-variant text-pretty">' + escapeHtml(m.observaciones) + '</p>' +
            '<p class="font-label text-label-sm text-on-surface-variant mt-gutter-xs">Técnico: ' + escapeHtml(m.tecnico || 'No informado') + ' · Estado: ' + escapeHtml(m.estadoResultante) + '</p>' +
            pdfLinkHtml +
            '<div class="flex flex-wrap items-center gap-gutter-md mt-gutter-sm">' +
              '<button type="button" data-receipt-idx="' + idx + '" class="inline-flex items-center gap-gutter-xs font-label text-label-sm text-secondary hover:text-primary"><span class="material-symbols-outlined text-[15px]">qr_code_2</span>Comprobante PDF con QR</button>' +
              (pdfLinks.length > 0 && state.session && ['admin', 'comite'].indexOf(state.session.user.rol) !== -1
                ? '<button type="button" data-ai-maint="' + idx + '" class="inline-flex items-center gap-gutter-xs font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">auto_awesome</span>Analizar con IA</button>'
                : '') +
              (state.session && state.session.user && state.session.user.rol === 'admin' && m.id
                ? '<button type="button" data-edit-maint="' + idx + '" class="inline-flex items-center gap-gutter-xs font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">edit</span>Editar</button>'
                : '') +
            '</div>' +
          '</div>' +
        '</details>'
      );
    }).join('');

    container.querySelectorAll('[data-receipt-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = items[Number(btn.getAttribute('data-receipt-idx'))];
        if (m) printMaintenanceReceipt(m, btn);
      });
    });

    container.querySelectorAll('[data-ai-maint]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = items[Number(btn.getAttribute('data-ai-maint'))];
        const firstLink = m ? splitLinks(m.linkPdf)[0] : '';
        if (!firstLink) return;
        openAiAnalysis('Informe ' + m.tipo + ' · ' + formatShortDate(m.fecha), {
          action: 'analyzeDocument',
          fileUrl: firstLink,
          contexto: 'informe de mantención ' + m.tipo,
          titulo: state.data ? state.data.equipo.nombre : '',
        });
      });
    });

    container.querySelectorAll('[data-edit-maint]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = items[Number(btn.getAttribute('data-edit-maint'))];
        if (m) openEditMaintenanceModal(m);
      });
    });
  }

  function renderActiveTickets(tickets) {
    const container = document.getElementById('tickets-list');
    const badge = document.getElementById('tickets-count-badge');
    const num = document.getElementById('tickets-count-num');
    const dupHint = document.getElementById('report-duplicate-hint');
    const dupText = document.getElementById('report-duplicate-text');

    num.textContent = String(tickets.length);
    badge.className = tickets.length > 0
      ? 'inline-flex items-center justify-center min-w-6 h-6 px-gutter-sm rounded-full bg-warning-container text-on-warning-container tabular-nums'
      : 'inline-flex items-center justify-center min-w-6 h-6 px-gutter-sm rounded-full bg-success-container text-on-success-container tabular-nums';

    if (tickets.length === 0) {
      dupHint.classList.add('hidden');
      dupHint.classList.remove('flex');
      container.innerHTML =
        '<article class="w-full bg-surface-card rounded-lg border border-outline-subtle p-gutter-lg shadow-gco flex items-center gap-gutter-md">' +
          '<div class="w-8 h-8 rounded-md bg-success-container text-on-success-container flex items-center justify-center shrink-0">' +
            '<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: \'FILL\' 1;">check_circle</span>' +
          '</div>' +
          '<p class="font-body text-body-sm text-on-surface-variant">No hay incidencias abiertas en este equipo.</p>' +
        '</article>';
      return;
    }

    dupHint.classList.remove('hidden');
    dupHint.classList.add('flex');
    dupText.textContent = 'Reporte activo: ' + tickets[0].descripcion.slice(0, 60) + (tickets[0].descripcion.length > 60 ? '...' : '');

    container.innerHTML = tickets.map(function (t) {
      const isProc = t.estado.toLowerCase() === 'en proceso';
      const borderClass = isProc ? 'border-l-warning' : 'border-l-error';
      const iconBg = isProc ? 'bg-warning-container text-on-warning-container' : 'bg-error-container text-on-error-container';
      const iconName = isProc ? 'engineering' : 'report_problem';
      const fotoLinks = splitLinks(t.fotoAntesUrl);
      const fotoLink = fotoLinks.map(function (u, idx) {
        const lbl = fotoLinks.length === 1 ? 'Ver foto' : 'Foto ' + (idx + 1);
        return ' · <a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">' + lbl + '</a>';
      }).join('');

      return (
        '<article class="w-full bg-surface-card text-on-surface-card rounded-lg border border-outline-subtle border-l-4 ' + borderClass + ' p-gutter-lg shadow-gco flex items-start gap-gutter-md">' +
          '<div class="w-8 h-8 rounded-md ' + iconBg + ' flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">' +
            '<span class="material-symbols-outlined text-[18px]">' + iconName + '</span>' +
          '</div>' +
          '<div class="flex flex-col gap-gutter-xs min-w-0 flex-1">' +
            '<p class="font-title text-title-sm text-on-surface text-pretty">' + escapeHtml(t.descripcion) + '</p>' +
            '<div class="flex flex-wrap items-center gap-gutter-xs font-label text-label-md text-on-surface-variant">' +
              '<span class="text-on-warning-container">' + escapeHtml(t.estado) + '</span>' +
              '<span>·</span>' +
              '<span>' + escapeHtml(formatShortDate(t.fecha)) + '</span>' +
              fotoLink +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function renderDirectoryView(data) {
    document.title = data.edificio.nombre + ' — Equipos GCO';
    document.getElementById('header-building-name').textContent = data.edificio.nombre;
    document.getElementById('dir-count-ok').textContent = String(data.resumen.operativos);
    document.getElementById('dir-count-warn').textContent = String(data.resumen.observacion);
    document.getElementById('dir-count-err').textContent = String(data.resumen.fueraServicio);
    const pendingEl = document.getElementById('dir-count-pending');
    if (pendingEl) pendingEl.textContent = String(data.resumen.porProgramar || 0);

    const isOpsOrAdmin = Boolean(
      state.session &&
      state.session.user &&
      (state.session.user.rol === 'operaciones' || state.session.user.rol === 'admin')
    );
    const todayRonda = isOpsOrAdmin ? getTodayRondaStatusMap(data.edificio.id) : null;

    const list = document.getElementById('directory-list');
    list.innerHTML = data.equipos.map(function (eq) {
      const sem = eq.semaforo;
      const isOk = sem.color === 'verde';
      const dataState = isOk ? 'ok' : (sem.color === 'gris' ? 'pending' : 'alert');
      const borderLeft = sem.color === 'rojo'
        ? 'border-l-4 border-l-error'
        : (sem.color === 'amarillo' ? 'border-l-4 border-l-warning' : '');
      const iconBg = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo'
          ? 'bg-warning-container text-on-warning-container'
          : (sem.color === 'gris' ? 'bg-surface-subtle text-on-surface-variant' : 'bg-primary-container text-on-primary-container'));
      const badgeClass = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo'
          ? 'bg-warning-container text-on-warning-container'
          : (sem.color === 'gris' ? 'bg-surface-subtle text-on-surface-variant border border-outline' : 'bg-success-container text-on-success-container'));

      let rondaBadgeHtml = '';
      if (isOpsOrAdmin && todayRonda) {
        const eqKey = String(eq.id || '').toLowerCase();
        const areaKey = (String(eq.nombre || '') + ' (#' + String(eq.id || '') + ')').toLowerCase();
        const hit = todayRonda.byEqIdLower[eqKey] || todayRonda.byAreaLower[areaKey] || null;
        if (hit && hit.item) {
          const est = String(hit.item.estado || 'Conforme').toLowerCase();
          if (est.indexOf('urg') !== -1) {
            rondaBadgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label text-[10px] shrink-0">! Urgente hoy</span>';
          } else if (est.indexOf('obs') !== -1) {
            rondaBadgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-[10px] shrink-0">! Obs. hoy</span>';
          } else {
            rondaBadgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-label text-[10px] shrink-0">✓ Revisado hoy</span>';
          }
        } else if (todayRonda.items.length > 0) {
          rondaBadgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-subtle text-on-surface-variant border border-outline font-label text-[10px] shrink-0">○ Pendiente hoy</span>';
        }
      }

      return (
        '<button type="button" data-equipo-id="' + escapeHtml(eq.id) + '" data-state="' + dataState + '" class="dir-asset-item text-left w-full bg-surface-card text-on-surface-card rounded-lg border border-outline-subtle ' + borderLeft + ' p-gutter-md lg:p-gutter-lg shadow-gco flex items-center justify-between gap-gutter-sm hover:bg-surface-subtle transition-colors duration-state-change">' +
          '<div class="flex items-center gap-gutter-sm lg:gap-gutter-md min-w-0 flex-1">' +
            '<div class="w-10 h-10 rounded-md ' + iconBg + ' flex items-center justify-center shrink-0" aria-hidden="true">' +
              '<span class="material-symbols-outlined text-[20px]">' + guessEquipmentIcon(eq.nombre, eq.id) + '</span>' +
            '</div>' +
            '<div class="flex flex-col gap-0.5 min-w-0 flex-1">' +
              '<div class="flex items-center gap-gutter-xs flex-wrap">' +
                '<span class="font-title text-title-sm text-on-surface leading-snug">' + escapeHtml(eq.nombre) + '</span>' +
                rondaBadgeHtml +
              '</div>' +
              '<span class="font-label text-[11px] lg:text-label-sm text-on-surface-variant tabular-nums whitespace-nowrap truncate">#' + escapeHtml(eq.id) + ' · ' + escapeHtml(formatShortDate(sem.ultimaVisita)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1 shrink-0">' +
            '<span class="inline-flex items-center px-gutter-sm py-gutter-xs rounded-full ' + badgeClass + ' font-label text-[11px] lg:text-label-sm whitespace-nowrap">' + escapeHtml(sem.etiquetaCorta) + '</span>' +
            '<span class="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">chevron_right</span>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    renderDirectoryRondaBanner(data, isOpsOrAdmin, todayRonda);

    list.querySelectorAll('.dir-asset-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eqId = btn.getAttribute('data-equipo-id');
        navigateToEquipo(eqId);
      });
    });

    const searchEl = document.getElementById('dir-search-input');
    if (searchEl && searchEl.getAttribute('data-edif') !== String(data.edificio.id || '')) {
      searchEl.value = '';
      searchEl.setAttribute('data-edif', String(data.edificio.id || ''));
    }
    applyDirectoryFilters();

    renderDirectoryNotices(data.avisos || []);
    renderDirectoryCalendar(data);
    renderDirectoryDocuments(data);
    renderCommunityProfileView(data);

    updateSessionUI();
    showView('directory');
  }

  function renderDirectoryNotices(avisos) {
    const box = document.getElementById('directory-notices-box');
    if (!box) return;
    if (!avisos || avisos.length === 0) {
      box.classList.add('hidden');
      box.classList.remove('flex');
      box.innerHTML = '';
      return;
    }

    box.classList.remove('hidden');
    box.classList.add('flex');
    const latest = avisos[0];
    const tipoLow = String(latest.tipo || '').toLowerCase();
    const wrapCls = tipoLow === 'urgente'
      ? 'bg-error-container/70 border-error/30 text-on-error-container'
      : (tipoLow === 'preventivo' ? 'bg-warning-container/70 border-warning/30 text-on-warning-container' : 'bg-primary-container/70 border-primary/20 text-on-primary-container');
    const iconName = tipoLow === 'urgente' ? 'campaign' : (tipoLow === 'preventivo' ? 'engineering' : 'info');

    const extraHtml = avisos.length > 1
      ? '<details class="mt-gutter-xs">' +
          '<summary class="font-label text-[11px] cursor-pointer hover:underline">Ver ' + (avisos.length - 1) + ' aviso(s) anterior(es)</summary>' +
          '<div class="flex flex-col gap-gutter-xs mt-gutter-xs pt-gutter-xs border-t border-current/15">' +
            avisos.slice(1, 4).map(function (a) {
              return '<div class="text-[12px]"><strong>' + escapeHtml(a.titulo) + ':</strong> ' + escapeHtml(a.mensaje) + '</div>';
            }).join('') +
          '</div>' +
        '</details>'
      : '';

    box.innerHTML =
      '<article class="w-full rounded-lg border px-gutter-md py-gutter-sm flex items-start gap-gutter-sm ' + wrapCls + '">' +
        '<span class="material-symbols-outlined text-[20px] mt-0.5 shrink-0" aria-hidden="true">' + iconName + '</span>' +
        '<div class="flex flex-col gap-0.5 min-w-0 flex-1">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<span class="font-title text-title-sm truncate">' + escapeHtml(latest.titulo) + '</span>' +
            '<span class="font-label text-[11px] opacity-80 shrink-0">' + escapeHtml(latest.tipo) + '</span>' +
          '</div>' +
          '<p class="font-body text-body-sm opacity-90">' + escapeHtml(latest.mensaje) + '</p>' +
          extraHtml +
        '</div>' +
      '</article>';
  }

  function switchDirectoryTab(target) {
    document.querySelectorAll('.dir-view-tab').forEach(function (t) {
      const wasHidden = t.classList.contains('hidden');
      const isAct = t.getAttribute('data-dir-tab') === target;
      t.className = (isAct
        ? 'dir-view-tab py-gutter-sm px-gutter-xs rounded-sm bg-primary text-on-primary font-label text-[11px] md:text-label-sm inline-flex items-center justify-center gap-1 transition-colors duration-state-change'
        : 'dir-view-tab py-gutter-sm px-gutter-xs rounded-sm text-on-surface-variant hover:bg-surface-subtle font-label text-[11px] md:text-label-sm inline-flex items-center justify-center gap-1 transition-colors duration-state-change') + (wasHidden ? ' hidden' : '');
    });
    ['equipos', 'calendario', 'documentos', 'comunidad'].forEach(function (name) {
      const panel = document.getElementById('dir-panel-' + name);
      if (!panel) return;
      panel.classList.toggle('hidden', target !== name);
      panel.classList.toggle('flex', target === name);
    });
  }

  function renderDirectoryCalendar(data) {
    const panel = document.getElementById('dir-panel-calendario');
    if (!panel) return;
    const equipos = data.equipos || [];
    if (equipos.length === 0) {
      panel.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Sin equipos registrados para programar.</p>';
      return;
    }

    const vencidos = [];
    const proximos = [];
    const programados = [];
    const sinRegistro = [];

    equipos.forEach(function (eq) {
      const sem = eq.semaforo || {};
      if (sem.diasRestantes === null || sem.diasRestantes === undefined) {
        sinRegistro.push(eq);
      } else if (sem.color === 'rojo' || sem.diasRestantes < 0) {
        vencidos.push(eq);
      } else if (sem.diasRestantes <= 30) {
        proximos.push(eq);
      } else {
        programados.push(eq);
      }
    });

    const sortByDays = function (a, b) {
      return (a.semaforo.diasRestantes || 0) - (b.semaforo.diasRestantes || 0);
    };
    vencidos.sort(sortByDays);
    proximos.sort(sortByDays);
    programados.sort(sortByDays);

    function renderGroup(title, icon, badgeCls, items, allowQuickOrder) {
      if (items.length === 0) return '';
      const isAdmin = Boolean(state.session && state.session.user && state.session.user.rol === 'admin');
      const cards = items.map(function (eq) {
        const sem = eq.semaforo || {};
        const diasTxt = sem.diasRestantes === null || sem.diasRestantes === undefined
          ? 'Por programar'
          : (sem.diasRestantes < 0 ? 'Vencida hace ' + Math.abs(sem.diasRestantes) + ' días' : (sem.diasRestantes === 0 ? 'Vence hoy' : 'En ' + sem.diasRestantes + ' días'));
        const quickOrderBtn = (isAdmin && allowQuickOrder)
          ? '<button type="button" data-cal-order-eq="' + escapeHtml(eq.id) + '" data-cal-order-name="' + escapeHtml(eq.nombre) + '" class="px-gutter-sm py-0.5 rounded-sm bg-primary-container text-on-primary-container font-label text-[11px] hover:bg-outline">+ Orden</button>'
          : '';
        return (
          '<div class="w-full bg-surface-card rounded-lg border border-outline-subtle p-gutter-md shadow-sm flex items-center justify-between gap-gutter-md">' +
            '<button type="button" data-cal-eq="' + escapeHtml(eq.id) + '" class="text-left flex items-center gap-gutter-md min-w-0 flex-1 hover:opacity-80">' +
              '<div class="w-9 h-9 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">' +
                '<span class="material-symbols-outlined text-[18px]">' + guessEquipmentIcon(eq.nombre, eq.id) + '</span>' +
              '</div>' +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
                '<span class="font-label text-label-sm text-on-surface-variant truncate">' + escapeHtml(eq.empresa || 'Por asignar') + ' · Cada ' + escapeHtml(String(eq.periodicidadDias || 30)) + ' días</span>' +
              '</div>' +
            '</button>' +
            '<div class="flex flex-col items-end gap-1 shrink-0">' +
              '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px]">' + escapeHtml(diasTxt) + '</span>' +
              '<div class="flex items-center gap-gutter-xs">' +
                '<span class="font-mono text-[11px] text-on-surface-variant tabular-nums">' + escapeHtml(formatShortDate(sem.proximaVisita)) + '</span>' +
                quickOrderBtn +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="flex flex-col gap-gutter-sm">' +
          '<div class="flex items-center gap-gutter-xs px-gutter-xs">' +
            '<span class="material-symbols-outlined text-[18px] text-primary">' + icon + '</span>' +
            '<h2 class="font-headline text-title-sm text-on-surface">' + title + ' (' + items.length + ')</h2>' +
          '</div>' +
          '<div class="flex flex-col gap-gutter-sm">' + cards + '</div>' +
        '</div>'
      );
    }

    panel.innerHTML =
      renderGroup('Requiere atención inmediata', 'warning', 'bg-error-container text-on-error-container', vencidos, true) +
      renderGroup('Próximos 30 días', 'event_upcoming', 'bg-warning-container text-on-warning-container', proximos, true) +
      renderGroup('Programados (+30 días)', 'event_available', 'bg-success-container text-on-success-container', programados, false) +
      renderGroup('Sin mantención inicial', 'pending_actions', 'bg-surface-variant text-on-surface-variant', sinRegistro, true);

    panel.querySelectorAll('[data-cal-eq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigateToEquipo(btn.getAttribute('data-cal-eq'));
      });
    });

    panel.querySelectorAll('[data-cal-order-eq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eqId = btn.getAttribute('data-cal-order-eq');
        const eqName = btn.getAttribute('data-cal-order-name');
        openModal('modal-admin');
        loadAdminPanelData().then(function () {
          const ordTab = document.querySelector('[data-admin-tab="ordenes"]');
          if (ordTab) ordTab.click();
          const eqSel = document.getElementById('ord-equipo');
          const titleInp = document.getElementById('ord-titulo');
          if (eqSel) eqSel.value = eqId;
          if (titleInp) titleInp.value = 'Mantención preventiva · ' + eqName;
        });
      });
    });
  }

  function renderDirectoryDocuments(data) {
    const panel = document.getElementById('dir-panel-documentos');
    if (!panel) return;
    const docs = data.documentos || [];
    const canAi = Boolean(state.session && state.session.user && ['admin', 'comite'].indexOf(state.session.user.rol) !== -1);
    const canEdit = Boolean(state.session && state.session.user && state.session.user.rol === 'admin');

    const headerBar =
      '<div class="flex items-center justify-between gap-gutter-sm px-gutter-xs">' +
        '<span class="font-label text-label-sm text-on-surface-variant">Certificaciones, reglamentos y contratos vigentes</span>' +
        (canEdit
          ? '<button type="button" id="btn-dir-add-doc" class="inline-flex items-center gap-1 px-gutter-md py-gutter-xs rounded-md bg-primary-container text-on-primary-container font-label text-label-sm hover:bg-outline"><span class="material-symbols-outlined text-[16px]">upload_file</span>Subir</button>'
          : '') +
      '</div>';

    if (docs.length === 0) {
      panel.innerHTML = headerBar + '<p class="font-body text-body-sm text-on-surface-variant px-gutter-xs">Aún no hay documentos cargados en esta comunidad.</p>';
    } else {
      panel.innerHTML = headerBar + docs.map(function (d) {
        const badgeCls = d.colorVencimiento === 'rojo'
          ? 'bg-error-container text-on-error-container'
          : (d.colorVencimiento === 'amarillo'
              ? 'bg-warning-container text-on-warning-container'
              : (d.colorVencimiento === 'verde' ? 'bg-success-container text-on-success-container' : 'bg-surface-variant text-on-surface-variant'));
        const vencLabel = d.fechaVencimiento ? (d.estadoVencimiento + ' · ' + formatShortDate(d.fechaVencimiento)) : d.estadoVencimiento;
        const pdfActions = d.linkPdf
          ? '<div class="flex items-center gap-gutter-md mt-gutter-xs">' +
              '<a href="' + escapeHtml(d.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>Ver documento</a>' +
              (canAi
                ? '<button type="button" data-ai-doc-url="' + escapeHtml(d.linkPdf) + '" data-ai-doc-title="' + escapeHtml(d.titulo) + '" class="inline-flex items-center gap-1 font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">auto_awesome</span>Analizar con IA</button>'
                : '') +
            '</div>'
          : '<span class="font-label text-label-sm text-on-surface-variant mt-gutter-xs">Sin archivo adjunto (referencia)</span>';

        return (
          '<article class="w-full bg-surface-card rounded-lg border border-outline-subtle p-gutter-lg shadow-sm flex flex-col gap-gutter-xs">' +
            '<div class="flex items-start justify-between gap-gutter-sm">' +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<span class="font-label text-[11px] text-primary uppercase tracking-wide">' + escapeHtml(d.categoria) + '</span>' +
                '<h3 class="font-title text-title-sm text-on-surface">' + escapeHtml(d.titulo) + '</h3>' +
              '</div>' +
              '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px] shrink-0">' + escapeHtml(vencLabel) + '</span>' +
            '</div>' +
            (d.notas ? '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(d.notas) + '</p>' : '') +
            pdfActions +
          '</article>'
        );
      }).join('');
    }

    const addBtn = document.getElementById('btn-dir-add-doc');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openModal('modal-admin');
        loadAdminPanelData();
        const docTab = document.querySelector('[data-admin-tab="documentos"]');
        if (docTab) docTab.click();
      });
    }

    panel.querySelectorAll('[data-ai-doc-url]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openAiAnalysis(btn.getAttribute('data-ai-doc-title'), {
          action: 'analyzeDocument',
          fileUrl: btn.getAttribute('data-ai-doc-url'),
          contexto: 'documento oficial o certificación de comunidad',
          titulo: btn.getAttribute('data-ai-doc-title'),
        });
      });
    });
  }

  function renderCommunityProfileView(data) {
    const panel = document.getElementById('dir-panel-comunidad');
    if (!panel) return;
    const c = data.comunidad || {
      edificioId: data.edificio.id,
      nombre: data.edificio.nombre,
    };

    const row = function (icon, label, val) {
      return (
        '<div class="flex items-start gap-gutter-md py-gutter-sm border-b border-outline-subtle last:border-b-0">' +
          '<span class="material-symbols-outlined text-[18px] text-primary mt-0.5 shrink-0">' + icon + '</span>' +
          '<div class="flex flex-col gap-0.5 min-w-0">' +
            '<span class="font-label text-label-sm text-on-surface-variant">' + label + '</span>' +
            '<span class="font-body text-body-sm text-on-surface break-words">' + escapeHtml(val || 'Por completar en Administración') + '</span>' +
          '</div>' +
        '</div>'
      );
    };

    const canEdit = Boolean(state.session && state.session.user && state.session.user.rol === 'admin');
    const editBtn = canEdit
      ? '<button type="button" id="btn-edit-community-shortcut" class="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-primary-container text-on-primary-container font-label text-label-sm hover:bg-outline transition-colors duration-state-change"><span class="material-symbols-outlined text-[16px]">edit</span>Editar ficha</button>'
      : '';

    panel.innerHTML =
      '<article class="w-full bg-surface-card rounded-lg border border-outline-subtle p-gutter-xl shadow-gco flex flex-col gap-gutter-md">' +
        '<div class="flex items-start justify-between gap-gutter-md">' +
          '<div class="flex flex-col gap-gutter-xs min-w-0">' +
            '<h2 class="font-headline text-headline-md text-on-surface truncate">' + escapeHtml(c.nombre || data.edificio.nombre) + '</h2>' +
            '<span class="font-mono text-mono-sm text-on-surface-variant">Comunidad #' + escapeHtml(c.edificioId || data.edificio.id) + (c.comuna ? ' · ' + escapeHtml(c.comuna) : '') + '</span>' +
          '</div>' +
          editBtn +
        '</div>' +
        '<div class="flex flex-col">' +
          row('location_on', 'Dirección', c.direccion) +
          row('home_work', 'Unidades / Estacionamientos / Bodegas', [c.totalUnidades, c.estacionamientos ? c.estacionamientos + ' estac.' : '', c.bodegas ? c.bodegas + ' bodegas' : ''].filter(Boolean).join(' · ')) +
          row('account_balance_wallet', 'Plataforma Financiera (Gastos Comunes)', c.plataformaFinanciera) +
          row('groups', 'Comité de Administración y Vigencia', [c.comiteRepresentantes, c.comiteVigencia].filter(Boolean).join(' · ')) +
          row('badge', 'Personal y Turnos', c.personalTurnos) +
          row('emergency', 'Contactos de Emergencia', c.contactosEmergencia) +
          row('support_agent', 'Responsables GCO Asignados', c.responsablesGco) +
          (c.notasGenerales ? row('notes', 'Notas de Operación', c.notasGenerales) : '') +
        '</div>' +
      '</article>';

    const shortcut = document.getElementById('btn-edit-community-shortcut');
    if (shortcut) {
      shortcut.addEventListener('click', function () {
        openModal('modal-admin');
        loadAdminPanelData();
        const fichaTab = document.querySelector('[data-admin-tab="comunidad"]');
        if (fichaTab) fichaTab.click();
      });
    }
  }

  function navigateToEquipo(equipoId) {
    const url = new URL(window.location.href);
    url.searchParams.set('edificio', state.edificioId);
    if (equipoId) {
      url.searchParams.set('equipo', equipoId);
    } else {
      url.searchParams.delete('equipo');
    }
    window.history.pushState({}, '', url.toString());
    readUrlAndLoad();
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(sessionObj) {
    state.session = sessionObj;
    if (sessionObj) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionObj));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    updateSessionUI();
    readUrlAndLoad();
  }

  function canTechEditCurrentEquipment() {
    const user = state.session && state.session.user ? state.session.user : null;
    if (!user) return false;
    if (user.rol === 'admin') return true;
    if (user.rol === 'operaciones') return String(state.edificioId || '').toUpperCase() !== 'DEMO';
    if (user.rol !== 'tecnico') return false;
    if (!state.data || state.data.mode !== 'equipo' || !state.data.equipo) return false;
    if (String(state.edificioId || '').toLowerCase() !== String(user.edificioId || '').toLowerCase()) return false;

    const assignedRaw = String(user.equiposAsignados || '').trim().toLowerCase();
    const curEqId = String(state.data.equipo.id || '').trim().toLowerCase();
    if (assignedRaw) {
      if (assignedRaw === 'all') return true;
      return assignedRaw.split(',').map(function (s) { return s.trim(); }).indexOf(curEqId) !== -1;
    }
    const empUser = String(user.deptoOEmpresa || '').trim().toLowerCase();
    const empEq = String(state.data.equipo.empresa || '').trim().toLowerCase();
    if (empUser && empEq) {
      return empEq.indexOf(empUser) !== -1 || empUser.indexOf(empEq) !== -1;
    }
    return false;
  }

  function updateSessionUI() {
    const user = state.session ? state.session.user : null;
    const roleBar = document.getElementById('role-actions-bar');
    const roleText = document.getElementById('role-session-text');
    const btnMaint = document.getElementById('btn-open-maintenance');
    const btnAdmin = document.getElementById('btn-open-admin');
    const btnCommittee = document.getElementById('btn-open-committee');
    const btnAuth = document.getElementById('btn-open-auth');
    const btnLogout = document.getElementById('btn-logout');

    const btnEditEqHero = document.getElementById('btn-edit-current-eq');

    if (!user) {
      roleBar.classList.add('hidden');
      roleBar.classList.remove('flex');
      btnMaint.classList.add('hidden');
      btnMaint.classList.remove('inline-flex');
      const btnRondaOut = document.getElementById('btn-open-ronda');
      if (btnRondaOut) {
        btnRondaOut.classList.add('hidden');
        btnRondaOut.classList.remove('inline-flex');
      }
      if (btnEditEqHero) {
        btnEditEqHero.classList.add('hidden');
        btnEditEqHero.classList.remove('inline-flex');
      }
      btnAdmin.classList.add('hidden');
      btnAdmin.classList.remove('inline-flex');
      if (btnCommittee) {
        btnCommittee.classList.add('hidden');
        btnCommittee.classList.remove('inline-flex');
      }
      btnAuth.classList.remove('hidden');
      btnLogout.classList.add('hidden');
      return;
    }

    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    roleText.textContent = user.nombre + ' (' + user.rol.toUpperCase() + ')';

    const isAdminOnly = user.rol === 'admin';
    if (btnEditEqHero) {
      btnEditEqHero.classList.toggle('hidden', !isAdminOnly);
      btnEditEqHero.classList.toggle('inline-flex', isAdminOnly);
    }

    const canMaint = Boolean(
      user.rol === 'admin' ||
      user.rol === 'operaciones' ||
      (user.rol === 'tecnico' && canTechEditCurrentEquipment())
    );
    const canRonda = Boolean(user.rol === 'admin' || user.rol === 'operaciones');
    const isAdminPanel = Boolean(user.rol === 'admin' || user.rol === 'operaciones');
    const isOpsOnly = user.rol === 'operaciones';
    const isCommittee = user.rol === 'comite' || user.rol === 'admin';

    if (canMaint || canRonda || isAdminPanel || isCommittee) {
      roleBar.classList.remove('hidden');
      roleBar.classList.add('flex');
    } else {
      roleBar.classList.add('hidden');
      roleBar.classList.remove('flex');
    }

    btnMaint.classList.toggle('hidden', !canMaint);
    btnMaint.classList.toggle('inline-flex', canMaint);
    const btnRonda = document.getElementById('btn-open-ronda');
    if (btnRonda) {
      btnRonda.classList.toggle('hidden', !canRonda);
      btnRonda.classList.toggle('inline-flex', canRonda);
    }
    btnAdmin.classList.toggle('hidden', !isAdminPanel);
    btnAdmin.classList.toggle('inline-flex', isAdminPanel);
    const adminLbl = btnAdmin.querySelector('.font-label');
    if (adminLbl) {
      adminLbl.textContent = isOpsOnly
        ? 'Panel de Operaciones (Tickets, Órdenes, Equipos y Bodega)'
        : 'Panel de Administración (Tickets, Equipos y Usuarios)';
    }
    const headerChev = document.getElementById('header-building-chevron');
    if (headerChev) {
      headerChev.classList.toggle('hidden', !isAdminPanel);
    }
    const dirDocsTab = document.querySelector('.dir-view-tab[data-dir-tab="documentos"]');
    if (dirDocsTab) {
      dirDocsTab.classList.toggle('hidden', isOpsOnly);
      const tabBar = dirDocsTab.parentElement;
      if (tabBar) {
        tabBar.classList.toggle('grid-cols-4', !isOpsOnly);
        tabBar.classList.toggle('grid-cols-3', isOpsOnly);
      }
    }

    const adminTabsAllowedOps = ['tickets', 'ordenes', 'equipos', 'bodega'];
    document.querySelectorAll('.admin-panel-tab').forEach(function (tabBtn) {
      const tName = tabBtn.getAttribute('data-admin-tab');
      const hideForOps = isOpsOnly && adminTabsAllowedOps.indexOf(tName) === -1;
      tabBtn.classList.toggle('hidden', hideForOps);
    });
    if (isOpsOnly) {
      const activeAdminTab = document.querySelector('.admin-panel-tab.bg-primary');
      if (activeAdminTab && adminTabsAllowedOps.indexOf(activeAdminTab.getAttribute('data-admin-tab')) === -1) {
        const fallbackTab = document.querySelector('.admin-panel-tab[data-admin-tab="tickets"]');
        if (fallbackTab) fallbackTab.click();
      }
      const docPanel = document.getElementById('dir-panel-documentos');
      if (docPanel && !docPanel.classList.contains('hidden')) {
        switchDirectoryTab('equipos');
      }
    }
    const adminTitle = document.getElementById('sheet-admin-title');
    if (adminTitle) {
      adminTitle.textContent = isOpsOnly ? 'Panel de Operaciones' : 'Panel de Administración';
    }
    const adminSub = document.getElementById('sheet-admin-subtitle');
    if (adminSub) {
      adminSub.textContent = isOpsOnly
        ? 'Gestión en terreno de tickets, órdenes, equipos y bodega'
        : 'Gestión de comunidades, tickets, equipos y cuentas';
    }
    if (btnCommittee) {
      btnCommittee.classList.toggle('hidden', !isCommittee);
      btnCommittee.classList.toggle('inline-flex', isCommittee);
    }

    const unitInput = document.getElementById('resident-unit');
    if (unitInput && !unitInput.value && user.deptoOEmpresa) {
      unitInput.value = user.deptoOEmpresa;
    }
  }

  function applyDirectoryFilters() {
    const activeChip = document.querySelector('.dir-filter-chip.bg-primary');
    const filter = activeChip ? activeChip.getAttribute('data-filter') : 'all';
    const searchEl = document.getElementById('dir-search-input');
    const query = searchEl ? searchEl.value.trim().toLowerCase() : '';

    document.querySelectorAll('.dir-asset-item').forEach(function (item) {
      const st = item.getAttribute('data-state');
      const matchState = filter === 'all' || filter === st;
      const matchText = !query || (item.textContent || '').toLowerCase().indexOf(query) !== -1;
      const show = matchState && matchText;
      item.classList.toggle('hidden', !show);
      item.classList.toggle('flex', show);
    });
  }

  function bindEvents() {
    document.getElementById('btn-retry-load').addEventListener('click', loadData);
    bindRondaEvents();
    bindAdminEditModals();

    const headerPill = document.getElementById('header-building-pill');
    if (headerPill) {
      headerPill.addEventListener('click', function () {
        const user = state.session && state.session.user ? state.session.user : null;
        if (!user) return;
        if (user.rol === 'operaciones') {
          state.edificioId = '';
          state.equipoId = '';
          const url = new URL(window.location.href);
          url.searchParams.delete('edificio');
          url.searchParams.delete('equipo');
          window.history.pushState({}, '', url.toString());
          loadOpsHomeView();
        } else if (user.rol === 'admin') {
          openModal('modal-admin');
          loadAdminPanelData();
        }
      });
    }

    document.getElementById('btn-back-directory').addEventListener('click', function () {
      navigateToEquipo('');
    });

    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });

    ['modal-report', 'modal-auth', 'modal-maintenance', 'modal-admin', 'modal-qr', 'modal-committee', 'modal-ai', 'modal-edit-equipment', 'modal-edit-maint'].forEach(function (id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.addEventListener('click', function (e) {
        if (e.target === m) closeModal(id);
      });
    });

    const btnOpenCommittee = document.getElementById('btn-open-committee');
    if (btnOpenCommittee) {
      btnOpenCommittee.addEventListener('click', function () {
        openModal('modal-committee');
        loadCommitteeData();
      });
    }

    const searchEl = document.getElementById('dir-search-input');
    if (searchEl) {
      searchEl.addEventListener('input', applyDirectoryFilters);
    }

    document.querySelectorAll('.dir-filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.dir-filter-chip').forEach(function (c) {
          c.className = 'dir-filter-chip px-gutter-md py-gutter-xs rounded-full bg-surface-card border border-outline text-on-surface-variant font-label text-label-md hover:bg-surface-subtle transition-colors duration-state-change';
        });
        chip.className = 'dir-filter-chip px-gutter-md py-gutter-xs rounded-full bg-primary text-on-primary font-label text-label-md transition-colors duration-state-change';
        applyDirectoryFilters();
      });
    });

    document.getElementById('btn-open-report').addEventListener('click', function () {
      openModal('modal-report');
    });
    const btnHeroReport = document.getElementById('btn-hero-report');
    if (btnHeroReport) {
      btnHeroReport.addEventListener('click', function () {
        openModal('modal-report');
      });
    }

    document.querySelectorAll('.cat-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.reportCategory = chip.getAttribute('data-cat');
        document.querySelectorAll('.cat-chip').forEach(function (c) {
          c.className = 'cat-chip px-gutter-md py-gutter-xs rounded-full bg-surface-subtle border border-outline text-on-surface-variant hover:bg-surface-variant font-label text-label-sm transition-colors duration-state-change';
        });
        chip.className = 'cat-chip px-gutter-md py-gutter-xs rounded-full bg-primary text-on-primary font-label text-label-sm transition-colors duration-state-change';
      });
    });

    document.getElementById('btn-add-photo').addEventListener('click', function () {
      document.getElementById('report-photo-input').click();
    });

    document.getElementById('report-photo-input').addEventListener('change', async function (e) {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      try {
        for (let i = 0; i < files.length; i++) {
          if (state.reportPhotos.length >= 5) {
            showToast('Máximo 5 fotos por reporte', true);
            break;
          }
          const compressed = await compressImage(files[i], 1024, 0.75);
          state.reportPhotos.push(compressed.dataUrl);
        }
        renderReportPhotosPreview();
        e.target.value = '';
      } catch (err) {
        showToast('No se pudo procesar una de las imágenes', true);
      }
    });

    document.getElementById('sheet-report-form').addEventListener('submit', async function (e) {
      e.preventDefault();

      const btn = document.getElementById('btn-submit-report');
      setLoadingBtn(btn, true, 'Enviando reporte...');

      const descRaw = document.getElementById('resident-desc').value.trim();
      const descripcion = '[' + state.reportCategory + ']' + (descRaw ? ' ' + descRaw : ' Reportado por residente');

      const res = await postApi({
        action: 'createTicket',
        token: state.session ? state.session.token : '',
        edificioId: state.edificioId,
        equipoId: state.equipoId,
        depto: document.getElementById('resident-unit').value.trim(),
        emailVecino: document.getElementById('resident-email').value.trim(),
        descripcion: descripcion,
        fotos: state.reportPhotos,
      });

      setLoadingBtn(btn, false, 'Enviar reporte a administración');

      if (!res.ok) {
        showToast(res.error || 'Error al enviar ticket', true);
        return;
      }

      document.getElementById('sheet-report-form').reset();
      clearReportPhoto();
      closeModal('modal-report');
      showToast(res.message || 'Ticket enviado');
      loadData();
    });

    document.getElementById('btn-open-auth').addEventListener('click', function () {
      openModal('modal-auth');
    });

    document.getElementById('btn-logout').addEventListener('click', function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('gco_cache_v1_') === 0) localStorage.removeItem(k);
        });
      } catch (e) {}
      saveSession(null);
      showToast('Sesión cerrada');
      if (state.equipoId) loadData();
    });

    document.querySelectorAll('.auth-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.authMode = tab.getAttribute('data-auth-tab');
        document.querySelectorAll('.auth-tab').forEach(function (t) {
          t.className = t === tab
            ? 'auth-tab py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-label-md'
            : 'auth-tab py-gutter-sm rounded-sm text-on-surface-variant font-label text-label-md';
        });
        const regFields = document.getElementById('auth-register-fields');
        regFields.classList.toggle('hidden', state.authMode !== 'register');
        regFields.classList.toggle('flex', state.authMode === 'register');
        document.getElementById('btn-auth-label').textContent = state.authMode === 'register' ? 'Solicitar acceso' : 'Ingresar';
      });
    });

    document.getElementById('auth-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-auth-submit');
      setLoadingBtn(btn, true, 'Procesando...');

      const payload = {
        action: state.authMode,
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value,
      };

      if (state.authMode === 'register') {
        payload.nombre = document.getElementById('auth-name').value.trim();
        payload.deptoOEmpresa = document.getElementById('auth-company').value.trim();
        payload.edificioId = state.edificioId;
        payload.rol = document.getElementById('auth-role').value || 'tecnico';
      }

      const res = await postApi(payload);
      setLoadingBtn(btn, false, state.authMode === 'register' ? 'Solicitar acceso' : 'Ingresar');

      if (!res.ok) {
        showToast(res.error || 'Error de autenticación', true);
        return;
      }

      if (res.pending) {
        showToast(res.message);
        closeModal('modal-auth');
        document.getElementById('auth-form').reset();
        return;
      }

      if (res.requirePasswordChange) {
        state.tempToken = res.token;
        document.getElementById('auth-form').classList.add('hidden');
        document.getElementById('auth-reset-panel').classList.add('hidden');
        const forcePanel = document.getElementById('auth-force-password-panel');
        forcePanel.classList.remove('hidden');
        forcePanel.classList.add('flex');
        return;
      }

      saveSession({ token: res.token, user: res.user });
      closeModal('modal-auth');
      document.getElementById('auth-form').reset();
      showToast('Bienvenido/a, ' + res.user.nombre);
    });

    document.getElementById('force-password-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const p1 = document.getElementById('force-new-pass').value;
      const p2 = document.getElementById('force-confirm-pass').value;
      if (p1 !== p2) {
        showToast('Las contraseñas no coinciden', true);
        return;
      }
      const btn = document.getElementById('btn-force-pass-submit');
      setLoadingBtn(btn, true, 'Guardando...');
      const res = await postApi({
        action: 'completeFirstPassword',
        token: state.tempToken || '',
        newPassword: p1,
      });
      setLoadingBtn(btn, false, 'Guardar contraseña e ingresar');

      if (!res.ok) {
        showToast(res.error || 'No se pudo guardar la clave', true);
        return;
      }

      state.tempToken = '';
      document.getElementById('force-password-form').reset();
      document.getElementById('auth-force-password-panel').classList.add('hidden');
      document.getElementById('auth-force-password-panel').classList.remove('flex');
      document.getElementById('auth-form').classList.remove('hidden');
      document.getElementById('auth-form').reset();
      saveSession({ token: res.token, user: res.user });
      closeModal('modal-auth');
      showToast(res.message || 'Contraseña guardada');
    });

    // Recuperación de contraseña
    document.getElementById('btn-show-reset').addEventListener('click', function () {
      document.getElementById('auth-form').classList.add('hidden');
      document.getElementById('auth-reset-panel').classList.remove('hidden');
      document.getElementById('auth-reset-panel').classList.add('flex');
      document.getElementById('reset-request-form').classList.remove('hidden');
      document.getElementById('reset-confirm-form').classList.add('hidden');
    });

    document.getElementById('btn-back-login').addEventListener('click', function () {
      document.getElementById('auth-reset-panel').classList.add('hidden');
      document.getElementById('auth-reset-panel').classList.remove('flex');
      document.getElementById('auth-form').classList.remove('hidden');
    });

    document.getElementById('reset-request-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-reset-send');
      setLoadingBtn(btn, true, 'Enviando...');
      const email = document.getElementById('reset-email').value.trim();
      const res = await postApi({ action: 'requestPasswordReset', email: email });
      setLoadingBtn(btn, false, 'Enviar código a mi correo');

      if (!res.ok) {
        showToast(res.error || 'No se pudo enviar el código', true);
        return;
      }
      showToast(res.message);
      document.getElementById('reset-request-form').classList.add('hidden');
      document.getElementById('reset-confirm-form').classList.remove('hidden');
      document.getElementById('reset-confirm-form').classList.add('flex');
    });

    document.getElementById('reset-confirm-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-reset-confirm');
      setLoadingBtn(btn, true, 'Actualizando...');
      const email = document.getElementById('reset-email').value.trim();
      const code = document.getElementById('reset-code').value.trim();
      const newPassword = document.getElementById('reset-new-pass').value;
      const res = await postApi({
        action: 'confirmPasswordReset',
        email: email,
        code: code,
        newPassword: newPassword,
      });
      setLoadingBtn(btn, false, 'Restablecer contraseña');

      if (!res.ok) {
        showToast(res.error || 'Error al restablecer clave', true);
        return;
      }
      showToast(res.message);
      document.getElementById('reset-request-form').reset();
      document.getElementById('reset-confirm-form').reset();
      document.getElementById('btn-back-login').click();
    });

    function resetMaintenanceModalControls() {
      state.maintType = 'Preventiva';
      state.maintState = 'Operativo';
      document.querySelectorAll('.maint-type-btn').forEach(function (b) {
        b.className = b.getAttribute('data-maint-type') === 'Preventiva'
          ? 'maint-type-btn py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-label-sm transition-colors duration-state-change'
          : 'maint-type-btn py-gutter-sm rounded-sm text-on-surface-variant hover:bg-surface-variant font-label text-label-sm transition-colors duration-state-change';
      });
      document.querySelectorAll('.maint-state-pill').forEach(function (p) {
        p.className = p.getAttribute('data-maint-state') === 'Operativo'
          ? 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border-2 border-success bg-success-container text-on-success-container font-label text-label-sm transition-colors duration-state-change'
          : 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border border-outline bg-surface-subtle text-on-surface-variant font-label text-label-sm transition-colors duration-state-change';
      });
      const dateInput = document.getElementById('maint-date');
      if (dateInput) dateInput.value = getTodayIsoLocal();
    }

    document.getElementById('btn-open-maintenance').addEventListener('click', function () {
      resetMaintenanceModalControls();

      const areaWrap = document.getElementById('maint-area-select-wrap');
      const areaSel = document.getElementById('maint-area-select');
      if (areaWrap && areaSel) {
        if (!state.equipoId && state.data && Array.isArray(state.data.equipos) && state.data.equipos.length > 0) {
          areaSel.innerHTML = state.data.equipos.map(function (eq) {
            return '<option value="' + escapeHtml(eq.id) + '">' + escapeHtml(eq.nombre) + ' (#' + escapeHtml(eq.id) + ')</option>';
          }).join('');
          document.getElementById('maint-eq-subtitle').textContent = state.data.edificio.nombre + ' · Ronda rápida';
          areaWrap.classList.remove('hidden');
          areaWrap.classList.add('flex');
        } else {
          areaWrap.classList.add('hidden');
          areaWrap.classList.remove('flex');
        }
      }

      const ordWrap = document.getElementById('maint-complete-orders-wrap');
      const ordChk = document.getElementById('maint-complete-orders');
      const ordLbl = document.getElementById('maint-complete-orders-label');
      if (ordWrap && ordChk) {
        const pendingOrders = (state.equipoId && state.data && Array.isArray(state.data.ordenesPendientes)) ? state.data.ordenesPendientes : [];
        if (pendingOrders.length > 0) {
          ordChk.checked = true;
          if (ordLbl) {
            ordLbl.textContent = pendingOrders.length === 1
              ? 'Marcar como Completada la Orden pendiente (' + pendingOrders[0].titulo + ')'
              : 'Marcar como Completadas las ' + pendingOrders.length + ' Órdenes pendientes de este equipo';
          }
          ordWrap.classList.remove('hidden');
          ordWrap.classList.add('flex');
        } else {
          ordChk.checked = false;
          ordWrap.classList.add('hidden');
          ordWrap.classList.remove('flex');
        }
      }

      openModal('modal-maintenance');
    });

    document.querySelectorAll('.quick-issue-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const txt = chip.getAttribute('data-issue-text') || '';
        const isOk = chip.getAttribute('data-issue-ok') === '1';
        const notesEl = document.getElementById('maint-sheet-notes');
        if (!notesEl) return;

        if (isOk) {
          notesEl.value = txt;
          const okPill = document.querySelector('.maint-state-pill[data-maint-state="Operativo"]');
          if (okPill) okPill.click();
        } else {
          const current = notesEl.value.trim();
          if (!current || current === 'Recorrido conforme, sin novedades ni observaciones.') {
            notesEl.value = txt;
          } else if (current.indexOf(txt) === -1) {
            notesEl.value = current + '. ' + txt;
          }
        }
      });
    });

    document.querySelectorAll('.maint-type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.maintType = btn.getAttribute('data-maint-type');
        document.querySelectorAll('.maint-type-btn').forEach(function (b) {
          b.className = b === btn
            ? 'maint-type-btn py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-label-sm transition-colors duration-state-change'
            : 'maint-type-btn py-gutter-sm rounded-sm text-on-surface-variant hover:bg-surface-variant font-label text-label-sm transition-colors duration-state-change';
        });
      });
    });

    document.querySelectorAll('.maint-state-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        state.maintState = pill.getAttribute('data-maint-state');
        document.querySelectorAll('.maint-state-pill').forEach(function (p) {
          p.className = 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border border-outline bg-surface-subtle text-on-surface-variant font-label text-label-sm transition-colors duration-state-change';
        });
        if (state.maintState === 'Operativo') {
          pill.className = 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border-2 border-success bg-success-container text-on-success-container font-label text-label-sm transition-colors duration-state-change';
        } else if (state.maintState === 'En Observacion') {
          pill.className = 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border-2 border-warning bg-warning-container text-on-warning-container font-label text-label-sm transition-colors duration-state-change';
        } else {
          pill.className = 'maint-state-pill py-gutter-sm px-gutter-xs rounded-md border-2 border-error bg-error-container text-on-error-container font-label text-label-sm transition-colors duration-state-change';
        }
      });
    });

    document.getElementById('btn-maint-file').addEventListener('click', function () {
      document.getElementById('maint-file-input').click();
    });

    document.getElementById('maint-file-input').addEventListener('change', async function (e) {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      let failed = 0;
      for (let i = 0; i < files.length; i++) {
        if (state.maintFiles.length >= 6) {
          showToast('Máximo 6 archivos por mantención', true);
          break;
        }
        const file = files[i];
        try {
          if (file.type && file.type.startsWith('image/')) {
            const compressed = await compressImage(file, 1280, 0.8);
            state.maintFiles.push({ name: file.name, base64: compressed.dataUrl, mimeType: 'image/jpeg', isImage: true });
          } else {
            if (file.size > 6 * 1024 * 1024) {
              showToast(file.name + ' supera los 6 MB permitidos', true);
              continue;
            }
            const dataUrl = await readFileAsDataUrl(file);
            state.maintFiles.push({ name: file.name, base64: dataUrl, mimeType: file.type || 'application/pdf', isImage: false });
          }
        } catch (fErr) {
          failed++;
        }
      }
      if (failed > 0) {
        showToast('No se pudieron leer ' + failed + ' archivo(s). Usa JPG, PNG o PDF.', true);
      }
      renderMaintFilesPreview();
      e.target.value = '';
    });

    setupSignaturePad();

    document.getElementById('sheet-maint-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!state.session) return;

      const btn = document.getElementById('btn-maint-submit');
      setLoadingBtn(btn, true, 'Publicando...');

      const totalChecks = document.querySelectorAll('.maint-check').length;
      const checks = Array.from(document.querySelectorAll('.maint-check:checked')).map(function (c) {
        return c.value;
      });
      const pct = totalChecks > 0 ? Math.round((checks.length / totalChecks) * 100) : 0;
      const notesRaw = document.getElementById('maint-sheet-notes').value.trim();
      const observaciones = (checks.length > 0 ? '[Pauta ' + checks.length + '/' + totalChecks + ' (' + pct + '%): ' + checks.join(', ') + '] ' : '') + notesRaw;

      const archivosPayload = state.maintFiles.map(function (f) {
        return { base64: f.base64, mimeType: f.mimeType, name: f.name };
      });
      const sigData = getSignatureDataUrl();
      if (sigData) {
        archivosPayload.push({ base64: sigData, mimeType: 'image/png', name: 'Firma_Terreno.png' });
      }

      const areaSel = document.getElementById('maint-area-select');
      const targetEquipoId = state.equipoId || (areaSel ? areaSel.value : '');
      const ordChk = document.getElementById('maint-complete-orders');
      const ordWrap = document.getElementById('maint-complete-orders-wrap');
      const completarOrdenes = Boolean(ordChk && ordWrap && !ordWrap.classList.contains('hidden') && ordChk.checked);

      const res = await postApi({
        action: 'addMaintenance',
        token: state.session.token,
        edificioId: state.edificioId,
        equipoId: targetEquipoId,
        fecha: document.getElementById('maint-date').value,
        tipo: state.maintType,
        estadoResultante: state.maintState,
        observaciones: observaciones,
        costoClp: Number(document.getElementById('maint-cost').value || 0),
        archivos: archivosPayload,
        completarOrdenes: completarOrdenes,
      });

      const createTicketChk = document.getElementById('maint-create-ticket');
      if (res.ok && createTicketChk && createTicketChk.checked && targetEquipoId) {
        const imgPhotos = state.maintFiles.filter(function (f) { return f.isImage; }).map(function (f) { return f.base64; });
        await postApi({
          action: 'createTicket',
          token: state.session.token,
          edificioId: state.edificioId,
          equipoId: targetEquipoId,
          depto: 'Ronda Administración',
          emailVecino: state.session.user.email,
          descripcion: '[Hallazgo en Ronda] ' + notesRaw,
          fotos: imgPhotos,
        });
      }

      setLoadingBtn(btn, false, 'Guardar y publicar registro');

      if (!res.ok) {
        showToast(res.error || 'Error al registrar mantención', true);
        return;
      }

      document.getElementById('sheet-maint-form').reset();
      resetMaintenanceModalControls();
      clearSignaturePad();
      state.maintFiles = [];
      renderMaintFilesPreview();
      closeModal('modal-maintenance');
      showToast(res.message || 'Mantención publicada');
      loadData();
    });

    document.getElementById('btn-open-admin').addEventListener('click', function () {
      openModal('modal-admin');
      loadAdminPanelData();
    });

    document.getElementById('admin-building-select').addEventListener('change', function (e) {
      const nuevoEdif = e.target.value;
      if (nuevoEdif === state.edificioId) return;
      state.edificioId = nuevoEdif;
      state.equipoId = '';
      const url = new URL(window.location.href);
      if (nuevoEdif) {
        url.searchParams.set('edificio', nuevoEdif);
        if (nuevoEdif.toUpperCase() !== 'DEMO') {
          try { localStorage.setItem(LAST_EDIF_KEY, nuevoEdif); } catch (err) {}
        }
      } else {
        url.searchParams.delete('edificio');
      }
      url.searchParams.delete('equipo');
      window.history.pushState({}, '', url.toString());
      if (nuevoEdif) {
        loadData();
      } else if (state.session && state.session.user && state.session.user.rol === 'operaciones') {
        loadOpsHomeView();
      }
      loadAdminPanelData();
    });

    document.querySelectorAll('.dir-view-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchDirectoryTab(tab.getAttribute('data-dir-tab'));
      });
    });

    document.querySelectorAll('.admin-panel-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const target = tab.getAttribute('data-admin-tab');
        const isOps = Boolean(state.session && state.session.user && state.session.user.rol === 'operaciones');
        const opsAllowed = ['tickets', 'ordenes', 'equipos', 'bodega'];
        if (isOps && opsAllowed.indexOf(target) === -1) return;

        document.querySelectorAll('.admin-panel-tab').forEach(function (t) {
          const tName = t.getAttribute('data-admin-tab');
          const shouldHide = isOps && opsAllowed.indexOf(tName) === -1;
          t.className = (t === tab
            ? 'admin-panel-tab py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-[11px] md:text-label-sm'
            : 'admin-panel-tab py-gutter-sm rounded-sm text-on-surface-variant font-label text-[11px] md:text-label-sm') + (shouldHide ? ' hidden' : '');
        });
        ['control', 'tickets', 'ordenes', 'cotizaciones', 'equipos', 'bodega', 'documentos', 'avisos', 'comunidad', 'auditoria', 'usuarios'].forEach(function (name) {
          const panel = document.getElementById('admin-tab-' + name);
          if (!panel) return;
          panel.classList.toggle('hidden', target !== name);
          panel.classList.toggle('flex', target === name);
        });
      });
    });
  }

  function clearReportPhoto() {
    state.reportPhotos = [];
    document.getElementById('report-photo-input').value = '';
    renderReportPhotosPreview();
  }

  function renderReportPhotosPreview() {
    const wrap = document.getElementById('report-photo-preview-wrap');
    const label = document.getElementById('photo-label');
    if (state.reportPhotos.length === 0) {
      label.textContent = 'Subir fotos';
      wrap.classList.add('hidden');
      wrap.classList.remove('flex');
      wrap.innerHTML = '';
      return;
    }
    label.textContent = state.reportPhotos.length + (state.reportPhotos.length === 1 ? ' foto lista' : ' fotos listas');
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
    wrap.innerHTML = state.reportPhotos.map(function (src, idx) {
      return (
        '<div class="relative w-16 h-16 shrink-0">' +
          '<img src="' + src + '" alt="Foto ' + (idx + 1) + '" class="w-16 h-16 object-cover rounded-sm border border-outline">' +
          '<button type="button" data-rm-rphoto="' + idx + '" aria-label="Quitar foto" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-secondary text-[12px] flex items-center justify-center shadow">×</button>' +
        '</div>'
      );
    }).join('');

    wrap.querySelectorAll('[data-rm-rphoto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = Number(btn.getAttribute('data-rm-rphoto'));
        state.reportPhotos.splice(idx, 1);
        renderReportPhotosPreview();
      });
    });
  }

  function renderMaintFilesPreview() {
    const wrap = document.getElementById('maint-file-preview-wrap');
    const label = document.getElementById('maint-file-label');
    if (state.maintFiles.length === 0) {
      label.textContent = 'Adjuntar Informe PDF o Fotos';
      wrap.classList.add('hidden');
      wrap.classList.remove('flex');
      wrap.innerHTML = '';
      return;
    }
    label.textContent = state.maintFiles.length + (state.maintFiles.length === 1 ? ' archivo adjunto' : ' archivos adjuntos');
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
    wrap.innerHTML = state.maintFiles.map(function (f, idx) {
      const thumb = f.isImage
        ? '<img src="' + f.base64 + '" alt="' + escapeHtml(f.name) + '" class="w-16 h-16 object-cover rounded-sm border border-outline">'
        : '<div class="w-16 h-16 rounded-sm border border-outline bg-primary-container text-on-primary-container flex flex-col items-center justify-center px-1 text-center"><span class="material-symbols-outlined text-[20px]">picture_as_pdf</span><span class="text-[9px] truncate w-full">' + escapeHtml(f.name) + '</span></div>';
      return (
        '<div class="relative w-16 h-16 shrink-0">' +
          thumb +
          '<button type="button" data-rm-mfile="' + idx + '" aria-label="Quitar archivo" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-secondary text-[12px] flex items-center justify-center shadow">×</button>' +
        '</div>'
      );
    }).join('');

    wrap.querySelectorAll('[data-rm-mfile]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = Number(btn.getAttribute('data-rm-mfile'));
        state.maintFiles.splice(idx, 1);
        renderMaintFilesPreview();
      });
    });
  }

  async function loadAdminPanelData() {
    if (!state.session) return;
    const cacheKey = 'admin_' + (state.edificioId || 'ALL');
    const cached = loadDataCache(cacheKey);
    if (cached && cached.payload) {
      applyAdminPanelData(cached.payload);
    }

    const url = new URL(API_URL);
    url.searchParams.set('action', 'adminData');
    url.searchParams.set('token', state.session.token);
    url.searchParams.set('edificio', state.edificioId);

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        if (!cached) showToast(json.error || 'Error al cargar panel', true);
        return;
      }
      saveDataCache(cacheKey, json);
      applyAdminPanelData(json);
    } catch (err) {
      if (cached && cached.payload) {
        showToast('Sin señal · Mostrando últimos datos del panel');
      } else {
        showToast('Error de red al cargar panel', true);
      }
    }
  }

  function applyAdminPanelData(json) {
    const selWrap = document.getElementById('admin-building-selector-wrap');
    const sel = document.getElementById('admin-building-select');
    if (json.isGlobalAdmin && json.edificios && json.edificios.length > 0) {
      selWrap.classList.remove('hidden');
      selWrap.classList.add('flex');
      const curEdif = state.edificioId || '';
      const allOpt = '<option value=""' + (!curEdif || curEdif.toUpperCase() === 'ALL' ? ' selected' : '') + '>Todas las comunidades (vista general)</option>';
      sel.innerHTML = allOpt + json.edificios.map(function (ed) {
        const selected = ed.id === curEdif ? ' selected' : '';
        return '<option value="' + escapeHtml(ed.id) + '"' + selected + '>' + escapeHtml(ed.nombre) + ' (' + escapeHtml(ed.id) + ')</option>';
      }).join('');
    } else {
      selWrap.classList.add('hidden');
      selWrap.classList.remove('flex');
    }

    renderAdminControlCenter(json.controlCenter || null);
    renderAdminTickets(json.tickets || []);
    renderAdminOrdenes(json.ordenes || [], json.equipos || []);
    renderAdminCotizaciones(json.cotizaciones || [], json.equipos || []);
    renderAdminEquipos(json.equipos || []);
    renderAdminBodega(json.inventario || []);
    renderAdminDocumentos(json.documentos || (state.data && state.data.documentos) || []);
    renderAdminAvisos(json.avisos || (state.data && state.data.avisos) || []);
    renderAdminComunidad(json.comunidad || (state.data && state.data.comunidad) || null);
    renderAdminAuditoria(json.auditoria || []);
    renderAdminUsers(json.usuarios || []);
  }

  function renderAdminControlCenter(cc) {
    const container = document.getElementById('admin-tab-control');
    if (!container) return;
    if (!cc) {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Actualiza Code.gs en Apps Script para activar el Control Center multi-comunidad.</p>';
      return;
    }

    const kpi = function (label, val, cls) {
      return (
        '<div class="bg-surface-subtle rounded-md border border-outline p-gutter-sm flex flex-col gap-0.5">' +
          '<span class="font-label text-[11px] text-on-surface-variant">' + label + '</span>' +
          '<span class="font-headline text-headline-md ' + (cls || 'text-on-surface') + ' tabular-nums">' + escapeHtml(String(val)) + '</span>' +
        '</div>'
      );
    };

    const kpisHtml =
      '<div class="grid grid-cols-2 md:grid-cols-3 gap-gutter-sm">' +
        kpi('Comunidades', cc.totalComunidades, 'text-primary') +
        kpi('Órdenes pendientes', cc.ordenesPendientes || 0, (cc.ordenesPendientes || 0) > 0 ? 'text-warning' : 'text-success') +
        kpi('Incidencias abiertas', cc.ticketsPendientes, cc.ticketsPendientes > 0 ? 'text-warning' : 'text-success') +
        kpi('Mant. atrasadas / falla', cc.mantencionesAtrasadas, cc.mantencionesAtrasadas > 0 ? 'text-error' : 'text-success') +
        kpi('Cotizaciones pend.', cc.cotizacionesPendientes, 'text-on-surface') +
        kpi('Docs por vencer/vencidos', cc.docsPorVencer, cc.docsPorVencer > 0 ? 'text-warning' : 'text-success') +
      '</div>';

    const listHtml = (cc.porComunidad || []).map(function (c) {
      const hasErr = c.atrasadas > 0;
      const hasWarn = c.porVencer > 0 || c.ticketsAbiertos > 0 || (c.ordenesAbiertas || 0) > 0 || c.docsAlerta > 0;
      const dotCls = hasErr ? 'bg-error' : (hasWarn ? 'bg-warning' : 'bg-success');
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-center justify-between gap-gutter-sm">' +
          '<div class="flex items-start gap-gutter-sm min-w-0">' +
            '<span class="w-2.5 h-2.5 rounded-full ' + dotCls + ' mt-1.5 shrink-0"></span>' +
            '<div class="flex flex-col gap-0.5 min-w-0">' +
              '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(c.nombre) + ' <span class="font-mono text-[11px] text-on-surface-variant">#' + escapeHtml(c.id) + '</span></span>' +
              '<span class="font-label text-[11px] text-on-surface-variant">' +
                c.equipos + ' eq · ' + c.atrasadas + ' rojas · ' + c.ticketsAbiertos + ' tickets · ' + (c.ordenesAbiertas || 0) + ' órdenes · ' + c.docsAlerta + ' docs' +
              '</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" data-cc-go="' + escapeHtml(c.id) + '" class="px-gutter-md py-1 rounded-md bg-primary-container text-on-primary-container font-label text-label-sm hover:bg-outline shrink-0">Abrir</button>' +
        '</article>'
      );
    }).join('');

    const rondas = Array.isArray(cc.ultimasRondas) ? cc.ultimasRondas : [];
    const rondasHtml = rondas.length === 0
      ? '<p class="font-body text-body-sm text-on-surface-variant">Aún no hay rondas guardadas. Apenas Operaciones guarde una ronda aparecerá aquí.</p>'
      : rondas.map(function (r) {
          const hasUrg = (r.urgentes || 0) > 0;
          const hasObs = (r.observaciones || 0) > 0;
          const borderCls = hasUrg ? 'border-error/40' : (hasObs ? 'border-warning/40' : 'border-outline');
          const badges =
            (hasUrg ? '<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label text-[10px]">' + r.urgentes + ' urg.</span>' : '') +
            (hasObs ? '<span class="px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-[10px]">' + r.observaciones + ' obs.</span>' : '') +
            '<span class="px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-label text-[10px]">' + (r.conformes || 0) + ' OK</span>';
          const linesHtml = r.detalle
            ? '<div class="font-body text-[12px] text-on-surface-variant whitespace-pre-line leading-relaxed bg-surface-card rounded-md border border-outline-subtle p-gutter-sm mt-gutter-xs">' + escapeHtml(r.detalle) + '</div>'
            : '';
          return (
            '<details class="bg-surface-subtle rounded-lg border ' + borderCls + ' p-gutter-md">' +
              '<summary class="cursor-pointer flex items-start justify-between gap-gutter-sm">' +
                '<div class="flex flex-col gap-0.5 min-w-0">' +
                  '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(r.edificioNombre || r.edificioId) + '</span>' +
                  '<span class="font-label text-[11px] text-on-surface-variant">' + escapeHtml(formatShortDate(r.fecha)) + ' · ' + escapeHtml(r.operador || 'Operaciones') + ' (' + (r.totalEspacios || 0) + ' espacios)</span>' +
                  '<div class="flex items-center gap-1 flex-wrap mt-0.5">' + badges + '</div>' +
                '</div>' +
                '<span class="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">expand_more</span>' +
              '</summary>' +
              linesHtml +
              '<div class="flex items-center gap-gutter-sm flex-wrap mt-gutter-sm">' +
                (r.linkPdf ? '<a href="' + escapeHtml(r.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-gutter-sm py-1 rounded-md bg-primary text-on-primary font-label text-[11px]"><span class="material-symbols-outlined text-[14px]">picture_as_pdf</span>Abrir PDF</a>' : '') +
                (r.carpetaDrive ? '<a href="' + escapeHtml(r.carpetaDrive) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-gutter-sm py-1 rounded-md bg-surface-card border border-outline text-on-surface font-label text-[11px]"><span class="material-symbols-outlined text-[14px]">folder</span>Fotos Drive</a>' : '') +
                '<button type="button" data-cc-go="' + escapeHtml(r.edificioId) + '" class="inline-flex items-center gap-1 px-gutter-sm py-1 rounded-md bg-primary-container text-on-primary-container font-label text-[11px]">Ir al edificio</button>' +
              '</div>' +
            '</details>'
          );
        }).join('');

    const isAdmin = Boolean(state.session && state.session.user && state.session.user.rol === 'admin');
    const panelGcoBtn = isAdmin
      ? '<a href="https://gcoadmin.cl/panel-gco/" target="_blank" rel="noopener noreferrer" class="w-full min-h-[42px] inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded-md bg-secondary text-on-secondary font-label text-label-md hover:bg-primary transition-colors duration-state-change">' +
          '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">account_balance</span>' +
          '<span>Abrir Conciliación Financiera (panel-gco)</span>' +
        '</a>'
      : '';

    container.innerHTML =
      '<div class="flex flex-col gap-gutter-md">' +
        panelGcoBtn +
        kpisHtml +
        '<div class="flex flex-col gap-gutter-sm">' +
          '<span class="font-title text-title-sm text-on-surface">Últimas Rondas en Terreno (revisión rápida)</span>' +
          rondasHtml +
        '</div>' +
        '<div class="flex flex-col gap-gutter-sm">' +
          '<span class="font-title text-title-sm text-on-surface">Estado por comunidad (priorizado por urgencia)</span>' +
          (listHtml || '<p class="font-body text-body-sm text-on-surface-variant">Sin comunidades registradas.</p>') +
        '</div>' +
      '</div>';

    container.querySelectorAll('[data-cc-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-cc-go');
        if (!targetId) return;
        state.edificioId = targetId;
        state.equipoId = '';
        const sel = document.getElementById('admin-building-select');
        if (sel) sel.value = targetId;
        const url = new URL(window.location.href);
        url.searchParams.set('edificio', targetId);
        url.searchParams.delete('equipo');
        window.history.pushState({}, '', url.toString());
        loadData();
        loadAdminPanelData();
        const ticketsTab = document.querySelector('[data-admin-tab="tickets"]');
        if (ticketsTab) ticketsTab.click();
      });
    });
  }

  function renderAdminAuditoria(items) {
    const container = document.getElementById('admin-tab-auditoria');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Aún no hay movimientos registrados en la bitácora.</p>';
      return;
    }
    container.innerHTML = items.map(function (a) {
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-start justify-between gap-gutter-sm">' +
          '<div class="flex flex-col gap-0.5 min-w-0">' +
            '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(a.accion) + '</span>' +
            '<span class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(a.detalle) + '</span>' +
            '<span class="font-label text-[11px] text-on-surface-variant">' + escapeHtml(a.usuario) + (a.rol ? ' (' + escapeHtml(a.rol) + ')' : '') + ' · #' + escapeHtml(a.edificioId) + '</span>' +
          '</div>' +
          '<span class="font-mono text-[11px] text-on-surface-variant shrink-0 tabular-nums">' + escapeHtml(formatShortDate(a.fecha)) + '</span>' +
        '</article>'
      );
    }).join('');
  }

  function renderAdminAvisos(avisos) {
    const container = document.getElementById('admin-tab-avisos');
    if (!container) return;

    const formHtml =
      '<form id="admin-add-notice-form" class="bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
        '<span class="font-title text-title-sm text-on-surface">Publicar aviso a la comunidad</span>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-gutter-sm">' +
          '<select id="aviso-tipo" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
            '<option value="Informativo">Informativo</option>' +
            '<option value="Preventivo">Preventivo</option>' +
            '<option value="Urgente">Urgente</option>' +
          '</select>' +
          '<input id="aviso-titulo" type="text" required placeholder="Título breve del aviso" class="md:col-span-2 rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<textarea id="aviso-mensaje" rows="2" required placeholder="Mensaje claro para residentes y comité (horarios, sectores afectados...)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm"></textarea>' +
        '<button type="submit" id="btn-add-notice-submit" class="min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-md hover:bg-secondary transition-colors duration-state-change">Publicar Aviso</button>' +
      '</form>';

    const listHtml = (!avisos || avisos.length === 0)
      ? '<p class="font-body text-body-sm text-on-surface-variant">No hay avisos registrados en esta comunidad.</p>'
      : avisos.map(function (a) {
          const badgeCls = a.activo ? 'bg-success-container text-on-success-container' : 'bg-surface-variant text-on-surface-variant';
          const isDemo = a.id.indexOf('AV-DEMO') !== -1;
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-start justify-between gap-gutter-sm">' +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(a.titulo) + '</span>' +
                '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(a.mensaje) + '</p>' +
                '<span class="font-label text-[11px] text-on-surface-variant">' + escapeHtml(a.tipo) + ' · ' + escapeHtml(formatShortDate(a.fecha)) + '</span>' +
              '</div>' +
              '<div class="flex flex-col items-end gap-1 shrink-0">' +
                '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px]">' + (a.activo ? 'Activo' : 'Archivado') + '</span>' +
                (!isDemo
                  ? '<button type="button" data-toggle-notice="' + escapeHtml(a.id) + '" data-next-active="' + (a.activo ? '0' : '1') + '" class="font-label text-[11px] text-primary hover:underline">' + (a.activo ? 'Archivar' : 'Reactivar') + '</button>'
                  : '') +
              '</div>' +
            '</article>'
          );
        }).join('');

    container.innerHTML = formHtml + listHtml;

    document.getElementById('admin-add-notice-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-add-notice-submit');
      setLoadingBtn(btn, true, 'Publicando...');
      const res = await postApi({
        action: 'addNotice',
        token: state.session.token,
        edificioId: state.edificioId,
        tipo: document.getElementById('aviso-tipo').value,
        titulo: document.getElementById('aviso-titulo').value.trim(),
        mensaje: document.getElementById('aviso-mensaje').value.trim(),
      });
      setLoadingBtn(btn, false, 'Publicar Aviso');
      if (!res.ok) {
        showToast(res.error || 'No se pudo publicar el aviso', true);
        return;
      }
      showToast(res.message || 'Aviso publicado');
      loadData();
      loadAdminPanelData();
    });

    container.querySelectorAll('[data-toggle-notice]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const res = await postApi({
          action: 'toggleNotice',
          token: state.session.token,
          noticeId: btn.getAttribute('data-toggle-notice'),
          activo: btn.getAttribute('data-next-active') === '1',
        });
        if (!res.ok) {
          showToast(res.error || 'No se pudo actualizar', true);
          return;
        }
        showToast(res.message || 'Aviso actualizado');
        loadData();
        loadAdminPanelData();
      });
    });
  }

  function renderAdminDocumentos(docs) {
    const container = document.getElementById('admin-tab-documentos');
    if (!container) return;

    const formHtml =
      '<form id="admin-add-doc-form" class="bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
        '<span class="font-title text-title-sm text-on-surface">Subir documento o certificación</span>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-sm">' +
          '<select id="doc-categoria" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
            '<option value="Certificación SEC / Ascensores">Certificación SEC / Ascensores</option>' +
            '<option value="Reglamento de Copropiedad">Reglamento de Copropiedad</option>' +
            '<option value="Contrato Proveedor">Contrato Proveedor</option>' +
            '<option value="Póliza de Seguro">Póliza de Seguro</option>' +
            '<option value="Acta / Legal">Acta / Legal</option>' +
            '<option value="Otro">Otro</option>' +
          '</select>' +
          '<input id="doc-vencimiento" type="date" aria-label="Fecha de vencimiento (opcional)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<input id="doc-titulo" type="text" required placeholder="Título (ej. Certificado Sello Verde Gas SEC 2026)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<input id="doc-notas" type="text" placeholder="Notas o proveedor (opcional)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-sm">' +
          '<input id="doc-file" type="file" accept="application/pdf,image/*" class="text-label-sm text-on-surface-variant">' +
          '<input id="doc-link" type="url" placeholder="O pega enlace Drive (opcional)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<button type="submit" id="btn-add-doc-submit" class="min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-md hover:bg-secondary transition-colors duration-state-change">Guardar en Repositorio</button>' +
      '</form>';

    const listHtml = (!docs || docs.length === 0)
      ? '<p class="font-body text-body-sm text-on-surface-variant">Sin documentos registrados en esta comunidad.</p>'
      : docs.map(function (d) {
          const badgeCls = d.colorVencimiento === 'rojo'
            ? 'bg-error-container text-on-error-container'
            : (d.colorVencimiento === 'amarillo' ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container');
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-center justify-between gap-gutter-sm">' +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(d.titulo) + '</span>' +
                '<span class="font-label text-label-sm text-on-surface-variant truncate">' + escapeHtml(d.categoria) + (d.fechaVencimiento ? ' · Vence ' + escapeHtml(formatShortDate(d.fechaVencimiento)) : '') + '</span>' +
              '</div>' +
              '<div class="flex items-center gap-gutter-xs shrink-0">' +
                (d.linkPdf ? '<a href="' + escapeHtml(d.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="px-gutter-sm py-1 rounded-sm bg-primary-container text-on-primary-container font-label text-[11px]">PDF</a>' : '') +
                '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px]">' + escapeHtml(d.estadoVencimiento) + '</span>' +
                (d.id.indexOf('DOC-DEMO') === -1
                  ? '<button type="button" data-del-doc="' + escapeHtml(d.id) + '" aria-label="Eliminar documento" class="p-1 text-error hover:bg-error-container rounded-sm"><span class="material-symbols-outlined text-[16px]">delete</span></button>'
                  : '') +
              '</div>' +
            '</article>'
          );
        }).join('');

    container.innerHTML = formHtml + listHtml;

    document.getElementById('admin-add-doc-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!requireSelectedAdminBuilding()) return;
      const btn = document.getElementById('btn-add-doc-submit');
      setLoadingBtn(btn, true, 'Subiendo...');

      let archivoBase64 = '';
      let archivoMime = '';
      const fileInp = document.getElementById('doc-file');
      if (fileInp && fileInp.files && fileInp.files[0]) {
        const f = fileInp.files[0];
        try {
          if (f.type && f.type.startsWith('image/')) {
            const comp = await compressImage(f, 1280, 0.8);
            archivoBase64 = comp.dataUrl;
            archivoMime = 'image/jpeg';
          } else {
            if (f.size > 6 * 1024 * 1024) {
              setLoadingBtn(btn, false, 'Guardar en Repositorio');
              showToast('El archivo supera los 6 MB permitidos', true);
              return;
            }
            archivoBase64 = await readFileAsDataUrl(f);
            archivoMime = f.type || 'application/pdf';
          }
        } catch (fErr) {
          setLoadingBtn(btn, false, 'Guardar en Repositorio');
          showToast('No se pudo leer el archivo adjunto. Usa PDF, JPG o PNG.', true);
          return;
        }
      }

      const res = await postApi({
        action: 'addDocument',
        token: state.session.token,
        edificioId: state.edificioId,
        categoria: document.getElementById('doc-categoria').value,
        titulo: document.getElementById('doc-titulo').value.trim(),
        fechaVencimiento: document.getElementById('doc-vencimiento').value,
        notas: document.getElementById('doc-notas').value.trim(),
        linkPdf: document.getElementById('doc-link').value.trim(),
        archivoBase64: archivoBase64,
        archivoMime: archivoMime,
      });

      setLoadingBtn(btn, false, 'Guardar en Repositorio');
      if (!res.ok) {
        showToast(res.error || 'No se pudo guardar el documento', true);
        return;
      }
      showToast(res.message || 'Documento guardado');
      loadData();
      loadAdminPanelData();
    });

    container.querySelectorAll('[data-del-doc]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const res = await postApi({
            action: 'deleteDocument',
            token: state.session.token,
            docId: btn.getAttribute('data-del-doc'),
          });
          if (!res.ok) {
            showToast(res.error || 'No se pudo eliminar', true);
            return;
          }
          showToast('Documento eliminado');
          loadData();
          loadAdminPanelData();
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function renderAdminComunidad(com) {
    const container = document.getElementById('admin-tab-comunidad');
    if (!container) return;

    if (!state.edificioId || state.edificioId.toUpperCase() === 'ALL') {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Selecciona una comunidad específica arriba para editar su Ficha Maestra.</p>';
      return;
    }

    const c = com || { edificioId: state.edificioId, nombre: state.edificioId };
    container.innerHTML =
      '<form id="admin-comunidad-form" class="bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
        '<div class="flex items-center justify-between gap-gutter-sm">' +
          '<span class="font-title text-title-sm text-on-surface">Ficha Maestra · #' + escapeHtml(state.edificioId) + '</span>' +
          (c.ultimaActualizacion ? '<span class="font-label text-label-sm text-on-surface-variant">Act: ' + escapeHtml(formatShortDate(c.ultimaActualizacion)) + '</span>' : '') +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-sm">' +
          '<input id="com-nombre" type="text" required value="' + escapeHtml(c.nombre || '') + '" placeholder="Nombre oficial de la comunidad" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
          '<input id="com-comuna" type="text" value="' + escapeHtml(c.comuna || '') + '" placeholder="Comuna (Ej. Concepción)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<input id="com-direccion" type="text" value="' + escapeHtml(c.direccion || '') + '" placeholder="Dirección exacta" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<div class="grid grid-cols-3 gap-gutter-sm">' +
          '<input id="com-unidades" type="text" value="' + escapeHtml(c.totalUnidades || '') + '" placeholder="Unidades (ej. 96 deptos)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
          '<input id="com-estac" type="text" value="' + escapeHtml(c.estacionamientos || '') + '" placeholder="Estacionamientos" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
          '<input id="com-bodegas" type="text" value="' + escapeHtml(c.bodegas || '') + '" placeholder="Bodegas" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-sm">' +
          '<input id="com-plataforma" type="text" value="' + escapeHtml(c.plataformaFinanciera || '') + '" placeholder="Plataforma financiera (ComunidadFeliz, Kastor, EdiPro...)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
          '<input id="com-vigencia" type="text" value="' + escapeHtml(c.comiteVigencia || '') + '" placeholder="Vigencia Comité (Ej. Dic 2026)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '</div>' +
        '<input id="com-comite" type="text" value="' + escapeHtml(c.comiteRepresentantes || '') + '" placeholder="Integrantes del Comité de Administración" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<input id="com-personal" type="text" value="' + escapeHtml(c.personalTurnos || '') + '" placeholder="Personal contratado y turnos (Conserjería, Aseo)" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<input id="com-emergencia" type="text" value="' + escapeHtml(c.contactosEmergencia || '') + '" placeholder="Contactos de emergencia clave" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<input id="com-gco" type="text" value="' + escapeHtml(c.responsablesGco || '') + '" placeholder="Responsables GCO asignados" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
        '<textarea id="com-notas" rows="2" placeholder="Notas operativas o reglamento relevante" class="rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' + escapeHtml(c.notasGenerales || '') + '</textarea>' +
        '<button type="submit" id="btn-save-comunidad" class="min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-md hover:bg-secondary transition-colors duration-state-change">Guardar Ficha Maestra</button>' +
      '</form>';

    document.getElementById('admin-comunidad-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-save-comunidad');
      setLoadingBtn(btn, true, 'Guardando...');
      const res = await postApi({
        action: 'saveCommunityProfile',
        token: state.session.token,
        edificioId: state.edificioId,
        nombre: document.getElementById('com-nombre').value.trim(),
        comuna: document.getElementById('com-comuna').value.trim(),
        direccion: document.getElementById('com-direccion').value.trim(),
        totalUnidades: document.getElementById('com-unidades').value.trim(),
        estacionamientos: document.getElementById('com-estac').value.trim(),
        bodegas: document.getElementById('com-bodegas').value.trim(),
        plataformaFinanciera: document.getElementById('com-plataforma').value.trim(),
        comiteVigencia: document.getElementById('com-vigencia').value.trim(),
        comiteRepresentantes: document.getElementById('com-comite').value.trim(),
        personalTurnos: document.getElementById('com-personal').value.trim(),
        contactosEmergencia: document.getElementById('com-emergencia').value.trim(),
        responsablesGco: document.getElementById('com-gco').value.trim(),
        notasGenerales: document.getElementById('com-notas').value.trim(),
      });
      setLoadingBtn(btn, false, 'Guardar Ficha Maestra');
      if (!res.ok) {
        showToast(res.error || 'No se pudo guardar la ficha', true);
        return;
      }
      showToast(res.message || 'Ficha guardada');
      if (state.data && res.comunidad) {
        state.data.comunidad = res.comunidad;
        renderCommunityProfileView(state.data);
      }
      loadAdminPanelData();
    });
  }

  function renderAdminTickets(tickets) {
    const container = document.getElementById('admin-tab-tickets');
    const pendientes = tickets.filter(function (t) {
      return t.estado.toLowerCase() !== 'resuelto';
    });

    if (pendientes.length === 0) {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">No hay tickets pendientes en este edificio.</p>';
      return;
    }

    container.innerHTML = pendientes.map(function (t) {
      const fotosAntes = splitLinks(t.fotoAntesUrl);
      const fotosHtml = fotosAntes.length > 0
        ? '<div class="flex flex-wrap gap-gutter-sm">' + fotosAntes.map(function (u, idx) {
            return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-sm bg-surface-card border border-outline font-label text-label-sm text-primary"><span class="material-symbols-outlined text-[14px]">photo</span>Evidencia ' + (idx + 1) + '</a>';
          }).join('') + '</div>'
        : '';

      let slaHtml = '';
      if (t.fecha) {
        const dt = new Date(String(t.fecha).replace(' ', 'T'));
        if (!isNaN(dt.getTime())) {
          const diasAbierto = Math.max(0, Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24)));
          const slaCls = diasAbierto >= 7
            ? 'bg-error-container text-on-error-container'
            : (diasAbierto >= 3 ? 'bg-warning-container text-on-warning-container' : 'bg-surface-card text-on-surface-variant border border-outline');
          const slaTxt = diasAbierto === 0 ? 'Hoy' : ('SLA ' + diasAbierto + 'd');
          slaHtml = '<span class="px-gutter-sm py-0.5 rounded-full font-label text-[11px] ' + slaCls + '">' + slaTxt + '</span>';
        }
      }

      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm" data-ticket-id="' + escapeHtml(t.id) + '">' +
          '<div class="flex items-start justify-between gap-gutter-sm">' +
            '<span class="font-mono text-mono-sm text-on-surface-variant">' + escapeHtml(t.id) + ' · #' + escapeHtml(t.equipoId) + ' · ' + escapeHtml(t.depto) + '</span>' +
            '<div class="flex items-center gap-1 shrink-0">' +
              slaHtml +
              '<span class="px-gutter-sm py-gutter-xs rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">' + escapeHtml(t.estado) + '</span>' +
            '</div>' +
          '</div>' +
          '<p class="font-title text-title-sm text-on-surface">' + escapeHtml(t.descripcion) + '</p>' +
          fotosHtml +
          '<input type="text" placeholder="Comentario de gestión o cierre..." class="admin-ticket-note w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-sm">' +
          '<div class="admin-ticket-thumbs hidden flex-wrap gap-gutter-xs"></div>' +
          '<div class="grid grid-cols-3 gap-gutter-sm">' +
            '<input type="file" accept="image/*" multiple class="admin-ticket-file hidden">' +
            '<button type="button" class="btn-admin-ticket-photo min-h-[42px] inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-md border border-dashed border-primary bg-primary-container text-on-primary-container font-label text-label-sm">' +
              '<span class="material-symbols-outlined text-[16px]">add_a_photo</span>' +
              '<span class="admin-photo-text">Fotos</span>' +
            '</button>' +
            '<button type="button" data-next-state="En Proceso" class="btn-admin-ticket-save min-h-[42px] px-gutter-sm py-gutter-xs rounded-md bg-warning-container text-on-warning-container font-label text-label-sm">En Proceso</button>' +
            '<button type="button" data-next-state="Resuelto" class="btn-admin-ticket-save min-h-[42px] px-gutter-sm py-gutter-xs rounded-md bg-success-container text-on-success-container font-label text-label-sm">Resolver</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    container.querySelectorAll('article[data-ticket-id]').forEach(function (card) {
      const fotosDespues = [];
      const fileInput = card.querySelector('.admin-ticket-file');
      const photoBtn = card.querySelector('.btn-admin-ticket-photo');
      const photoText = card.querySelector('.admin-photo-text');
      const thumbs = card.querySelector('.admin-ticket-thumbs');

      function renderTicketThumbs() {
        if (fotosDespues.length === 0) {
          photoText.textContent = 'Fotos';
          thumbs.classList.add('hidden');
          thumbs.classList.remove('flex');
          thumbs.innerHTML = '';
          return;
        }
        photoText.textContent = fotosDespues.length + ' foto' + (fotosDespues.length > 1 ? 's' : '');
        thumbs.classList.remove('hidden');
        thumbs.classList.add('flex');
        thumbs.innerHTML = fotosDespues.map(function (src, idx) {
          return '<img src="' + src + '" alt="Respaldo ' + (idx + 1) + '" class="w-12 h-12 object-cover rounded-sm border border-outline">';
        }).join('');
      }

      photoBtn.addEventListener('click', function () {
        fileInput.click();
      });

      fileInput.addEventListener('change', async function (e) {
        const files = Array.from(e.target.files || []);
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
          if (fotosDespues.length >= 5) break;
          try {
            const compressed = await compressImage(files[i], 1024, 0.75);
            fotosDespues.push(compressed.dataUrl);
          } catch (imgErr) {
            failed++;
          }
        }
        if (failed > 0) {
          showToast('No se pudieron leer ' + failed + ' foto(s). Intenta en JPG o PNG.', true);
        }
        renderTicketThumbs();
        e.target.value = '';
      });

      card.querySelectorAll('.btn-admin-ticket-save').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (btn.disabled) return;
          const saveBtns = card.querySelectorAll('.btn-admin-ticket-save');
          const prevText = btn.textContent;
          saveBtns.forEach(function (b) { b.disabled = true; });
          btn.textContent = 'Guardando...';
          try {
            const ticketId = card.getAttribute('data-ticket-id');
            const estado = btn.getAttribute('data-next-state');
            const solucion = card.querySelector('.admin-ticket-note').value.trim();

            const res = await postApi({
              action: 'updateTicket',
              token: state.session.token,
              ticketId: ticketId,
              estado: estado,
              solucion: solucion,
              fotosDespues: fotosDespues,
            });

            if (!res.ok) {
              showToast(res.error || 'No se pudo actualizar', true);
              return;
            }

            showToast(res.message);
            loadAdminPanelData();
            loadData();
          } finally {
            saveBtns.forEach(function (b) { b.disabled = false; });
            btn.textContent = prevText;
          }
        });
      });
    });
  }

  function renderAdminEquipos(equipos) {
    const container = document.getElementById('admin-tab-equipos');
    if (!container) return;

    const base = window.location.origin + window.location.pathname;
    const addBoxHtml =
      '<details class="bg-surface-subtle rounded-lg border border-outline p-gutter-md">' +
        '<summary class="font-title text-title-sm text-primary cursor-pointer flex items-center justify-between">' +
          '<span class="inline-flex items-center gap-gutter-xs"><span class="material-symbols-outlined text-[18px]">add_circle</span>Agregar equipo o certificación</span>' +
          '<span class="material-symbols-outlined text-[18px]">expand_more</span>' +
        '</summary>' +
        '<form id="admin-add-eq-form" class="flex flex-col gap-gutter-sm mt-gutter-md">' +
          '<div class="grid grid-cols-2 gap-gutter-xs">' +
            '<input id="new-eq-id" type="text" required placeholder="Código (ej. GAS-01)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-mono text-body-sm px-gutter-sm py-gutter-xs">' +
            '<input id="new-eq-name" type="text" required placeholder="Nombre (ej. Sello Verde Gas)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '</div>' +
          '<input id="new-eq-company" type="text" placeholder="Empresa / Certificador (ej. Certificadora SEC)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '<select id="new-eq-days" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
            '<option value="30">Mensual (30 días)</option>' +
            '<option value="90">Trimestral (90 días)</option>' +
            '<option value="180">Semestral (180 días)</option>' +
            '<option value="365">Anual · Extintores / Ascensores (365 días)</option>' +
            '<option value="730">Cada 2 años · Sello Verde Gas / Ascensores (730 días)</option>' +
          '</select>' +
          '<div class="grid grid-cols-3 gap-gutter-xs">' +
            '<input id="new-eq-marca" type="text" placeholder="Marca (opcional)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
            '<input id="new-eq-modelo" type="text" placeholder="Modelo (opcional)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
            '<input id="new-eq-serie" type="text" placeholder="N° Serie (opc.)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-mono text-body-sm px-gutter-sm py-gutter-xs">' +
          '</div>' +
          '<button type="submit" id="btn-add-eq-submit" class="w-full min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-md">Guardar equipo</button>' +
        '</form>' +
      '</details>';

    const vencidas = equipos.filter(function (e) { return e.semaforo && e.semaforo.color === 'rojo'; }).length;
    const porVencer = equipos.filter(function (e) { return e.semaforo && e.semaforo.color === 'amarillo'; }).length;
    const alDia = equipos.filter(function (e) { return e.semaforo && e.semaforo.color === 'verde'; }).length;
    const porProgramar = equipos.filter(function (e) { return e.semaforo && e.semaforo.color === 'gris'; }).length;

    const agendaStrip = equipos.length > 0
      ? '<div class="grid grid-cols-3 gap-gutter-xs">' +
          '<div class="bg-error-container text-on-error-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + vencidas + '</div><div class="font-label text-[11px]">Vencidas/Alerta</div></div>' +
          '<div class="bg-warning-container text-on-warning-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + porVencer + '</div><div class="font-label text-[11px]">Por vencer</div></div>' +
          '<div class="bg-success-container text-on-success-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + alDia + '</div><div class="font-label text-[11px]">Al día</div></div>' +
        '</div>' +
        (porProgramar > 0
          ? '<p class="font-label text-[11px] text-on-surface-variant text-center">Pendientes de primera mantención (por programar): <strong>' + porProgramar + '</strong></p>'
          : '')
      : '';

    const printTopBtn = equipos.length > 0
      ? '<button type="button" id="btn-print-all-qr" class="w-full min-h-[42px] inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded-md bg-secondary text-on-secondary font-label text-label-md shadow-sm hover:bg-primary transition-colors duration-state-change">' +
          '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">print</span>' +
          '<span>Imprimir láminas QR (' + equipos.length + ' equipos)</span>' +
        '</button>'
      : '';

    const cardsHtml = equipos.length === 0
      ? '<p class="font-body text-body-sm text-on-surface-variant">No hay equipos registrados en esta comunidad.</p>'
      : equipos.map(function (eq, idx) {
      const qrUrl = base + '?edificio=' + encodeURIComponent(eq.edificioId) + '&equipo=' + encodeURIComponent(eq.equipoId);
      const waUrl = 'https://wa.me/?text=' + encodeURIComponent('Ficha QR ' + eq.nombre + ' (' + eq.edificioId + '): ' + qrUrl);
      const sem = eq.semaforo || { color: 'verde', etiquetaCorta: 'Al día', proximaVisita: '--' };
      const semCls = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo'
          ? 'bg-warning-container text-on-warning-container'
          : (sem.color === 'gris' ? 'bg-surface-subtle text-on-surface-variant border border-outline' : 'bg-success-container text-on-success-container'));
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
          '<div class="flex items-start justify-between gap-gutter-sm">' +
            '<div class="flex flex-col min-w-0">' +
              '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
              '<span class="font-mono text-mono-sm text-on-surface-variant">#' + escapeHtml(eq.equipoId) + ' · ' + escapeHtml(eq.empresa) + '</span>' +
              '<span class="font-label text-[11px] text-on-surface-variant">Próx: ' + escapeHtml(formatShortDate(sem.proximaVisita)) + '</span>' +
            '</div>' +
            '<span class="px-gutter-sm py-0.5 rounded-full ' + semCls + ' font-label text-[11px] shrink-0">' + escapeHtml(sem.etiquetaCorta) + '</span>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-gutter-xs">' +
            '<button type="button" data-show-qr="' + idx + '" class="min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-sm inline-flex items-center justify-center gap-gutter-xs"><span class="material-symbols-outlined text-[16px]">qr_code_2</span>Ver / Descargar QR</button>' +
            '<button type="button" data-go-eq="' + escapeHtml(eq.equipoId) + '" class="min-h-[40px] rounded-md bg-surface-card border border-outline text-on-surface font-label text-label-sm">Abrir ficha</button>' +
            '<button type="button" data-copy-qr="' + escapeHtml(qrUrl) + '" class="min-h-[40px] rounded-md bg-surface-card border border-outline text-on-surface font-label text-label-sm">Copiar link</button>' +
            '<a href="' + escapeHtml(waUrl) + '" target="_blank" rel="noopener noreferrer" class="min-h-[40px] rounded-md bg-success-container text-on-success-container font-label text-label-sm inline-flex items-center justify-center">WhatsApp</a>' +
            (state.session && state.session.user && state.session.user.rol === 'admin'
              ? '<button type="button" data-edit-eq="' + idx + '" class="col-span-2 min-h-[38px] rounded-md bg-primary-container text-on-primary-container border border-primary/20 font-label text-label-sm inline-flex items-center justify-center gap-gutter-xs"><span class="material-symbols-outlined text-[16px]">edit</span>Editar datos del equipo</button>'
              : '') +
          '</div>' +
        '</article>'
      );
    }).join('');

    container.innerHTML = addBoxHtml + agendaStrip + printTopBtn + cardsHtml;

    const addForm = document.getElementById('admin-add-eq-form');
    if (addForm) {
      addForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!requireSelectedAdminBuilding()) return;
        const btn = document.getElementById('btn-add-eq-submit');
        setLoadingBtn(btn, true, 'Guardando...');
        const res = await postApi({
          action: 'addEquipment',
          token: state.session.token,
          edificioId: state.edificioId,
          equipoId: document.getElementById('new-eq-id').value.trim(),
          nombreEquipo: document.getElementById('new-eq-name').value.trim(),
          empresa: document.getElementById('new-eq-company').value.trim(),
          periodicidadDias: Number(document.getElementById('new-eq-days').value || 30),
          marca: document.getElementById('new-eq-marca').value.trim(),
          modelo: document.getElementById('new-eq-modelo').value.trim(),
          numeroSerie: document.getElementById('new-eq-serie').value.trim(),
        });
        setLoadingBtn(btn, false, 'Guardar equipo');
        if (!res.ok) {
          showToast(res.error || 'No se pudo agregar', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
        loadData();
      });
    }

    const btnPrintAll = document.getElementById('btn-print-all-qr');
    if (btnPrintAll) {
      btnPrintAll.addEventListener('click', function () {
        printQrCards(equipos);
      });
    }

    container.querySelectorAll('[data-show-qr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eq = equipos[Number(btn.getAttribute('data-show-qr'))];
        if (!eq) return;
        const qrUrl = base + '?edificio=' + encodeURIComponent(eq.edificioId) + '&equipo=' + encodeURIComponent(eq.equipoId);
        openQrModal(eq, qrUrl);
      });
    });

    container.querySelectorAll('[data-go-eq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eqId = btn.getAttribute('data-go-eq');
        closeModal('modal-admin');
        navigateToEquipo(eqId);
      });
    });

    container.querySelectorAll('[data-edit-eq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eq = equipos[Number(btn.getAttribute('data-edit-eq'))];
        if (eq) openEditEquipmentModal(eq);
      });
    });

    container.querySelectorAll('[data-copy-qr]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const url = btn.getAttribute('data-copy-qr');
        try {
          await navigator.clipboard.writeText(url);
          showToast('Link QR copiado');
        } catch (e) {
          showToast('Link: ' + url);
        }
      });
    });
  }

  let gcoLogoPromise = null;
  function loadGcoLogoImage() {
    if (gcoLogoPromise) return gcoLogoPromise;
    gcoLogoPromise = new Promise(function (resolve) {
      const existing = document.querySelector('#brand-logo-box img');
      if (existing && existing.complete && existing.naturalWidth > 0) {
        resolve(existing);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        resolve(img.naturalWidth > 0 ? img : null);
      };
      img.onerror = function () {
        gcoLogoPromise = null;
        resolve(null);
      };
      img.src = '../img/logo.png';
    });
    return gcoLogoPromise;
  }

  async function createBrandedQrCanvas(text, displaySize) {
    const size = displaySize || 220;
    const scale = 2;
    const px = size * scale;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '8px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, px, px);

    const logoImg = await loadGcoLogoImage();
    const quiet = Math.round(px * 0.045);
    const inner = px - quiet * 2;

    if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
      const maxW = inner * 0.88;
      const maxH = inner * 0.88;
      const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
      const drawW = logoImg.naturalWidth * ratio;
      const drawH = logoImg.naturalHeight * ratio;
      const drawX = (px - drawW) / 2;
      const drawY = (px - drawH) / 2;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.drawImage(logoImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;';
    document.body.appendChild(temp);
    try {
      const qr = new QRCode(temp, {
        text: text,
        width: inner,
        height: inner,
        colorDark: '#0F2942',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.H,
      });

      if (qr && qr._oQRCode && typeof qr._oQRCode.getModuleCount === 'function') {
        const count = qr._oQRCode.getModuleCount();
        const cell = inner / count;
        ctx.fillStyle = '#0F2942';
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr._oQRCode.isDark(r, c)) {
              const x = quiet + Math.floor(c * cell);
              const y = quiet + Math.floor(r * cell);
              const w = Math.ceil((c + 1) * cell) - Math.floor(c * cell);
              const h = Math.ceil((r + 1) * cell) - Math.floor(r * cell);
              ctx.fillRect(x, y, w, h);
            }
          }
        }
      } else {
        const srcCanvas = temp.querySelector('canvas');
        if (srcCanvas) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(srcCanvas, quiet, quiet, inner, inner);
          ctx.restore();
        }
      }
    } finally {
      if (temp.parentNode) temp.parentNode.removeChild(temp);
    }

    return canvas;
  }

  async function openQrModal(eq, qrUrl) {
    document.getElementById('sheet-qr-title').textContent = eq.nombre;
    document.getElementById('qr-modal-subtitle').textContent = eq.edificioId + ' · Equipo #' + eq.equipoId;
    document.getElementById('qr-url-preview').textContent = qrUrl;

    const box = document.getElementById('qr-canvas-box');
    box.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      box.textContent = 'Librería QR no cargada. Recarga la página.';
      openModal('modal-qr');
      return;
    }

    openModal('modal-qr');
    const qrCanvas = await createBrandedQrCanvas(qrUrl, 232);
    box.innerHTML = '';
    box.appendChild(qrCanvas);

    document.getElementById('btn-download-qr').onclick = function () {
      const canvas = box.querySelector('canvas');
      const img = box.querySelector('img');
      const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
      if (!dataUrl) {
        showToast('No se pudo generar la imagen QR', true);
        return;
      }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'QR_' + eq.edificioId + '_' + eq.equipoId + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Imagen QR descargada');
    };

    document.getElementById('btn-print-single-qr').onclick = function () {
      printQrCards([eq]);
    };
  }

  async function printQrCards(equipos) {
    if (typeof QRCode === 'undefined') {
      showToast('Librería QR no disponible', true);
      return;
    }
    const sheet = document.getElementById('print-qr-sheet');
    const base = window.location.origin + window.location.pathname;
    const buildingTitle = document.getElementById('header-building-name').textContent || state.edificioId;

    sheet.innerHTML =
      '<div style="font-family: \'Plus Jakarta Sans\', sans-serif; max-width: 820px; margin: 0 auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #1D5B96; padding-bottom: 12px; margin-bottom: 20px;">' +
          '<div>' +
            '<h1 style="font-size: 20px; font-weight: 700; color: #0F2942; margin: 0;">GCO Gestión de Condominios</h1>' +
            '<p style="font-size: 13px; color: #49607C; margin: 4px 0 0 0;">Láminas QR de Equipos · ' + escapeHtml(buildingTitle) + '</p>' +
          '</div>' +
          '<span style="font-family: \'Red Hat Mono\', monospace; font-size: 12px; color: #1D5B96;">gcoadmin.cl/app</span>' +
        '</div>' +
        '<div id="print-qr-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;"></div>' +
      '</div>';

    const grid = document.getElementById('print-qr-grid');
    for (let idx = 0; idx < equipos.length; idx++) {
      const eq = equipos[idx];
      const qrUrl = base + '?edificio=' + encodeURIComponent(eq.edificioId) + '&equipo=' + encodeURIComponent(eq.equipoId);
      const card = document.createElement('div');
      card.style.cssText = 'border: 1px solid #DEE3ED; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; background: #FFFFFF;';
      card.innerHTML =
        '<div style="font-size: 15px; font-weight: 700; color: #0F2942; margin-bottom: 4px;">' + escapeHtml(eq.nombre) + '</div>' +
        '<div style="font-family: \'Red Hat Mono\', monospace; font-size: 12px; color: #49607C; margin-bottom: 12px;">Equipo #' + escapeHtml(eq.equipoId) + '</div>' +
        '<div id="print-qr-box-' + idx + '" style="display: inline-block; padding: 8px; background: #FFFFFF;"></div>' +
        '<div style="font-size: 11px; color: #49607C; margin-top: 10px;">Escanea para ver estado, PDF o reportar fallas</div>';
      grid.appendChild(card);

      const qrCanvas = await createBrandedQrCanvas(qrUrl, 164);
      const qrImg = document.createElement('img');
      qrImg.src = qrCanvas.toDataURL('image/png');
      qrImg.width = 164;
      qrImg.height = 164;
      qrImg.style.display = 'block';
      document.getElementById('print-qr-box-' + idx).appendChild(qrImg);
    }

    const committeeSheet = document.getElementById('print-committee-sheet');
    if (committeeSheet) committeeSheet.classList.remove('print-active');
    sheet.classList.add('print-active');

    setTimeout(function () {
      window.print();
    }, 250);
  }

  async function loadCommitteeData() {
    if (!state.session) return;
    const cacheKey = 'comm_' + (state.edificioId || 'DEMO');
    const cached = loadDataCache(cacheKey);
    if (cached && cached.payload) {
      renderCommitteeModal(cached.payload);
    }

    const url = new URL(API_URL);
    url.searchParams.set('action', 'committeeData');
    url.searchParams.set('token', state.session.token);
    url.searchParams.set('edificio', state.edificioId);

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        if (!cached) showToast(json.error || 'No se pudo cargar el resumen de comité', true);
        return;
      }
      saveDataCache(cacheKey, json);
      renderCommitteeModal(json);
    } catch (err) {
      if (cached && cached.payload) {
        showToast('Sin señal · Mostrando último resumen guardado');
      } else {
        showToast('Error de red al cargar portal comité', true);
      }
    }
  }

  function renderCommitteeModal(data) {
    const r = data.resumen;
    document.getElementById('committee-building-subtitle').textContent =
      data.edificio.nombre +
      ' · Actualizado ' + formatShortDate(data.generadoEn) +
      ((r.porProgramar || 0) > 0 ? ' · ' + r.porProgramar + ' por programar' : '');

    document.getElementById('committee-summary-cards').innerHTML =
      '<div class="bg-success-container text-on-success-container rounded-md p-gutter-md flex flex-col gap-gutter-xs">' +
        '<span class="font-label text-label-sm">Operativos</span>' +
        '<span class="font-headline text-headline-md tabular-nums">' + r.operativos + '/' + r.totalEquipos + '</span>' +
      '</div>' +
      '<div class="bg-warning-container text-on-warning-container rounded-md p-gutter-md flex flex-col gap-gutter-xs">' +
        '<span class="font-label text-label-sm">Observación</span>' +
        '<span class="font-headline text-headline-md tabular-nums">' + r.observacion + '</span>' +
      '</div>' +
      '<div class="bg-error-container text-on-error-container rounded-md p-gutter-md flex flex-col gap-gutter-xs">' +
        '<span class="font-label text-label-sm">Alerta / Fuera</span>' +
        '<span class="font-headline text-headline-md tabular-nums">' + r.fueraServicio + '</span>' +
      '</div>';

    const rondasEl = document.getElementById('committee-rondas-list');
    if (rondasEl) {
      const rondas = Array.isArray(data.rondas) ? data.rondas : [];
      if (rondas.length === 0) {
        rondasEl.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant bg-surface-subtle rounded-lg border border-outline p-gutter-md">Aún no hay informes de ronda registrados para esta comunidad.</p>';
      } else {
        rondasEl.innerHTML = rondas.map(function (rd) {
          const pdfBtn = rd.linkPdf
            ? '<a href="' + escapeHtml(rd.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-primary text-on-primary font-label text-label-sm hover:bg-secondary transition-colors duration-state-change"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">picture_as_pdf</span><span>Ver Informe PDF</span></a>'
            : '';
          const fotosBtn = rd.carpetaDrive
            ? '<a href="' + escapeHtml(rd.carpetaDrive) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-primary-container text-on-primary-container border border-primary/20 font-label text-label-sm hover:bg-outline transition-colors duration-state-change"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">photo_library</span><span>Ver Fotos</span></a>'
            : '';
          const chips = [];
          chips.push('<span class="px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-label text-[11px] tabular-nums">' + (rd.conformes || 0) + ' conforme(s)</span>');
          if (rd.observaciones > 0) {
            chips.push('<span class="px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-[11px] tabular-nums">' + rd.observaciones + ' obs.</span>');
          }
          if (rd.urgentes > 0) {
            chips.push('<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label text-[11px] tabular-nums">' + rd.urgentes + ' urgente(s)</span>');
          }
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
              '<div class="flex flex-wrap items-center justify-between gap-gutter-xs">' +
                '<div class="flex flex-col min-w-0">' +
                  '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(formatShortDate(rd.fecha)) + '</span>' +
                  '<span class="font-label text-[11px] text-on-surface-variant">' + escapeHtml(rd.operador || 'Operaciones GCO') + ' · ' + (rd.totalEspacios || 0) + ' espacio(s) revisado(s)</span>' +
                '</div>' +
                '<div class="flex flex-wrap items-center gap-gutter-xs">' + chips.join('') + '</div>' +
              '</div>' +
              ((pdfBtn || fotosBtn)
                ? '<div class="flex flex-wrap items-center gap-gutter-sm pt-gutter-xs border-t border-outline-subtle">' + pdfBtn + fotosBtn + '</div>'
                : '') +
            '</article>'
          );
        }).join('');
      }
    }

    document.getElementById('committee-equipment-list').innerHTML = data.equipos.map(function (eq) {
      const sem = eq.semaforo;
      const badgeClass = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo'
          ? 'bg-warning-container text-on-warning-container'
          : (sem.color === 'gris' ? 'bg-surface-subtle text-on-surface-variant border border-outline' : 'bg-success-container text-on-success-container'));
      const pdfLinks = splitLinks(eq.ultimoPdf);
      const pdfHtml = pdfLinks.length > 0
        ? pdfLinks.map(function (lnk, idxL) {
            const lbl = pdfLinks.length === 1 ? 'Ver respaldo' : 'Archivo ' + (idxL + 1);
            return '<a href="' + escapeHtml(lnk) + '" target="_blank" rel="noopener noreferrer" class="font-label text-label-sm text-primary hover:underline">' + lbl + '</a>';
          }).join('<span class="text-outline">·</span>')
        : '<span class="font-label text-label-sm text-on-surface-variant">Sin PDF</span>';

      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-xs">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
            '<span class="px-gutter-sm py-gutter-xs rounded-full ' + badgeClass + ' font-label text-label-sm shrink-0">' + escapeHtml(sem.etiquetaCorta) + '</span>' +
          '</div>' +
          '<div class="flex flex-wrap items-center justify-between gap-gutter-xs text-on-surface-variant font-label text-label-sm">' +
            '<span>#' + escapeHtml(eq.id) + ' · ' + escapeHtml(eq.empresa) + ' · ' + escapeHtml(formatShortDate(sem.ultimaVisita)) + '</span>' +
            '<div class="flex flex-wrap items-center gap-gutter-xs">' + pdfHtml + '</div>' +
          '</div>' +
          '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(eq.ultimaObservacion) + '</p>' +
        '</article>'
      );
    }).join('');

    document.getElementById('committee-quotes-list').innerHTML = renderQuotesCardsHtml(data.cotizaciones || [], true);
    bindQuoteStatusButtons(document.getElementById('committee-quotes-list'), function () {
      loadCommitteeData();
    });

    document.getElementById('btn-print-committee').onclick = function () {
      printCommitteeReport(data);
    };

    const btnCommAi = document.getElementById('btn-committee-ai');
    if (btnCommAi) {
      btnCommAi.onclick = function () {
        openAiAnalysis('Resumen Ejecutivo · ' + data.edificio.nombre, {
          action: 'summarizeBuilding',
          edificioId: data.edificio.id,
        });
      };
    }

    const askForm = document.getElementById('committee-ai-ask-form');
    if (askForm) {
      askForm.onsubmit = function (e) {
        e.preventDefault();
        const inp = document.getElementById('committee-ai-question');
        const q = inp ? inp.value.trim() : '';
        if (!q) return;
        openAiAnalysis('GCO IA · ' + data.edificio.nombre, {
          action: 'askBuildingAi',
          edificioId: data.edificio.id,
          question: q,
        });
      };
    }

    const btnCompare = document.getElementById('btn-compare-quotes-ai');
    if (btnCompare) {
      const hasEnoughQuotes = (data.cotizaciones || []).length >= 2;
      btnCompare.classList.toggle('hidden', !hasEnoughQuotes);
      btnCompare.classList.toggle('inline-flex', hasEnoughQuotes);
      btnCompare.onclick = function () {
        openAiAnalysis('Comparador de Cotizaciones · ' + data.edificio.nombre, {
          action: 'compareQuotesAi',
          edificioId: data.edificio.id,
        });
      };
    }

    renderCommitteeAgreements(data);
  }

  function renderCommitteeAgreements(data) {
    const list = document.getElementById('committee-agreements-list');
    const form = document.getElementById('committee-agreement-form');
    if (!list) return;

    const acuerdos = data.acuerdos || [];
    if (acuerdos.length === 0) {
      list.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Sin acuerdos registrados en esta comunidad.</p>';
    } else {
      list.innerHTML = acuerdos.map(function (a) {
        const estLow = String(a.estado || '').toLowerCase();
        const badgeCls = estLow === 'cumplido'
          ? 'bg-success-container text-on-success-container'
          : (estLow === 'en gestión' || estLow === 'en gestion' ? 'bg-primary-container text-on-primary-container' : 'bg-warning-container text-on-warning-container');
        const isDemo = a.id.indexOf('AC-DEMO') !== -1;
        const actionBtn = (!isDemo && estLow !== 'cumplido')
          ? '<button type="button" data-agr-done="' + escapeHtml(a.id) + '" class="font-label text-[11px] text-primary hover:underline">Marcar cumplido</button>'
          : '';
        return (
          '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-start justify-between gap-gutter-sm">' +
            '<div class="flex flex-col gap-0.5 min-w-0">' +
              '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(a.materia) + '</span>' +
              '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(a.acuerdo) + '</p>' +
              '<span class="font-label text-[11px] text-on-surface-variant">Resp: ' + escapeHtml(a.responsable || 'Por asignar') + (a.fechaComprometida ? ' · Plazo: ' + escapeHtml(formatShortDate(a.fechaComprometida)) : '') + '</span>' +
            '</div>' +
            '<div class="flex flex-col items-end gap-1 shrink-0">' +
              '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px]">' + escapeHtml(a.estado) + '</span>' +
              actionBtn +
            '</div>' +
          '</article>'
        );
      }).join('');

      list.querySelectorAll('[data-agr-done]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const res = await postApi({
            action: 'updateAgreementStatus',
            token: state.session.token,
            agreementId: btn.getAttribute('data-agr-done'),
            estado: 'Cumplido',
          });
          if (!res.ok) {
            showToast(res.error || 'No se pudo actualizar', true);
            return;
          }
          showToast('Acuerdo marcado como cumplido');
          loadCommitteeData();
        });
      });
    }

    if (form) {
      form.onsubmit = async function (e) {
        e.preventDefault();
        const btn = document.getElementById('btn-add-agreement');
        setLoadingBtn(btn, true, 'Guardando...');
        const res = await postApi({
          action: 'addAgreement',
          token: state.session.token,
          edificioId: data.edificio.id,
          materia: document.getElementById('agr-materia').value.trim(),
          responsable: document.getElementById('agr-responsable').value.trim(),
          acuerdo: document.getElementById('agr-acuerdo').value.trim(),
          fechaComprometida: document.getElementById('agr-fecha').value,
        });
        setLoadingBtn(btn, false, 'Registrar');
        if (!res.ok) {
          showToast(res.error || 'No se pudo registrar el acuerdo', true);
          return;
        }
        form.reset();
        showToast(res.message || 'Acuerdo registrado');
        loadCommitteeData();
      };
    }
  }

  function renderQuotesCardsHtml(cotizaciones, allowAction) {
    if (!cotizaciones || cotizaciones.length === 0) {
      return '<p class="font-body text-body-sm text-on-surface-variant">No hay cotizaciones registradas en esta comunidad.</p>';
    }
    return cotizaciones.map(function (c) {
      const estLow = c.estado.toLowerCase();
      const badgeCls = estLow === 'aprobada'
        ? 'bg-success-container text-on-success-container'
        : (estLow === 'rechazada' ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container');
      const pdfHtml = c.linkPdf
        ? '<div class="flex items-center gap-gutter-sm">' +
            '<a href="' + escapeHtml(c.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="font-label text-label-sm text-primary hover:underline">Ver PDF</a>' +
            '<button type="button" data-ai-quote-url="' + escapeHtml(c.linkPdf) + '" data-ai-quote-title="' + escapeHtml(c.proveedor + ' ($' + Number(c.montoClp || 0).toLocaleString('es-CL') + ')') + '" class="btn-ai-quote inline-flex items-center gap-0.5 font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[14px]">auto_awesome</span>IA</button>' +
          '</div>'
        : '';
      const isAdmin = Boolean(state.session && state.session.user && state.session.user.rol === 'admin');
      let actionHtml = '';
      if (allowAction && estLow === 'pendiente') {
        actionHtml =
          '<div class="grid grid-cols-2 gap-gutter-xs mt-gutter-xs">' +
            '<button type="button" data-quote-id="' + escapeHtml(c.id) + '" data-quote-state="Aprobada" class="btn-quote-status min-h-[36px] rounded-md bg-success-container text-on-success-container font-label text-label-sm">Aprobar</button>' +
            '<button type="button" data-quote-id="' + escapeHtml(c.id) + '" data-quote-state="Rechazada" class="btn-quote-status min-h-[36px] rounded-md bg-error-container text-on-error-container font-label text-label-sm">Rechazar</button>' +
          '</div>';
      } else if (isAdmin && estLow === 'aprobada') {
        actionHtml =
          '<button type="button" data-q2o-eq="' + escapeHtml(c.equipoId) + '" data-q2o-title="' + escapeHtml('Trabajo ' + c.id + ' · ' + c.proveedor) + '" data-q2o-desc="' + escapeHtml(c.descripcion + ' ($' + Number(c.montoClp || 0).toLocaleString('es-CL') + ' CLP)') + '" class="btn-quote-to-order w-full min-h-[36px] mt-gutter-xs rounded-md bg-primary text-on-primary font-label text-label-sm">Generar Orden de Trabajo</button>';
      }
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-xs">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(c.proveedor) + '</span>' +
            '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-label-sm shrink-0">' + escapeHtml(c.estado) + '</span>' +
          '</div>' +
          '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(c.descripcion) + '</p>' +
          '<div class="flex items-center justify-between font-mono text-mono-sm text-on-surface">' +
            '<span>$' + Number(c.montoClp || 0).toLocaleString('es-CL') + ' CLP · #' + escapeHtml(c.equipoId) + '</span>' +
            pdfHtml +
          '</div>' +
          actionHtml +
        '</article>'
      );
    }).join('');
  }

  function requireSelectedAdminBuilding() {
    if (!state.edificioId || state.edificioId.toUpperCase() === 'ALL') {
      showToast('Selecciona primero una comunidad específica en "Comunidad activa" arriba.', true);
      const sel = document.getElementById('admin-building-select');
      if (sel) sel.focus();
      return false;
    }
    return true;
  }

  function bindQuoteStatusButtons(container, onSuccess) {
    if (!container) return;
    container.querySelectorAll('.btn-quote-status').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        const card = btn.closest('article');
        const siblings = card ? card.querySelectorAll('.btn-quote-status') : [btn];
        const prevText = btn.textContent;
        siblings.forEach(function (b) { b.disabled = true; });
        btn.textContent = 'Guardando...';
        try {
          const res = await postApi({
            action: 'updateQuoteStatus',
            token: state.session.token,
            quoteId: btn.getAttribute('data-quote-id'),
            estado: btn.getAttribute('data-quote-state'),
          });
          if (!res.ok) {
            showToast(res.error || 'No se pudo actualizar cotización', true);
            return;
          }
          showToast(res.message);
          if (onSuccess) onSuccess();
        } finally {
          siblings.forEach(function (b) { b.disabled = false; });
          btn.textContent = prevText;
        }
      });
    });

    container.querySelectorAll('.btn-quote-to-order').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        if (!requireSelectedAdminBuilding()) return;
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Generando orden...';
        try {
          const res = await postApi({
            action: 'addOrder',
            token: state.session.token,
            edificioId: state.edificioId,
            equipoId: btn.getAttribute('data-q2o-eq') || 'GENERAL',
            titulo: btn.getAttribute('data-q2o-title'),
            detalle: btn.getAttribute('data-q2o-desc'),
            prioridad: 'Normal',
          });
          if (!res.ok) {
            showToast(res.error || 'No se pudo generar la orden', true);
            return;
          }
          showToast(res.message);
          if (onSuccess) onSuccess();
        } finally {
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });

    container.querySelectorAll('.btn-ai-quote').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const title = btn.getAttribute('data-ai-quote-title') || 'Cotización';
        openAiAnalysis('Cotización · ' + title, {
          action: 'analyzeDocument',
          fileUrl: btn.getAttribute('data-ai-quote-url'),
          contexto: 'cotización de proveedor para condominio',
          titulo: title,
        });
      });
    });
  }

  async function openAiAnalysis(subtitle, payload) {
    if (!state.session) return;
    document.getElementById('ai-modal-subtitle').textContent = subtitle;
    const box = document.getElementById('ai-result-box');
    box.textContent = 'Analizando con Gemini IA, espera unos segundos...';
    openModal('modal-ai');

    const copyBtn = document.getElementById('btn-copy-ai');
    if (copyBtn) {
      copyBtn.onclick = async function () {
        try {
          await navigator.clipboard.writeText(box.textContent || '');
          showToast('Resumen copiado');
        } catch (e) {
          showToast('Selecciona y copia el texto manualmente');
        }
      };
    }

    const res = await postApi(Object.assign({ token: state.session.token }, payload));
    if (!res.ok) {
      box.textContent = 'Error: ' + (res.error || 'No se pudo completar el análisis.');
      return;
    }
    box.textContent = res.analysis || 'Sin respuesta.';
  }

  function renderAdminBodega(inventario) {
    const container = document.getElementById('admin-tab-bodega');
    if (!container) return;

    const formHtml =
      '<details class="bg-surface-subtle rounded-lg border border-outline p-gutter-md">' +
        '<summary class="font-title text-title-sm text-primary cursor-pointer flex items-center justify-between">' +
          '<span class="inline-flex items-center gap-gutter-xs"><span class="material-symbols-outlined text-[18px]">inventory_2</span>Agregar insumo a bodega</span>' +
          '<span class="material-symbols-outlined text-[18px]">expand_more</span>' +
        '</summary>' +
        '<form id="admin-add-inv-form" class="flex flex-col gap-gutter-sm mt-gutter-md">' +
          '<input id="inv-producto" type="text" required placeholder="Producto (ej. Tubo LED 18W)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '<div class="grid grid-cols-3 gap-gutter-xs">' +
            '<input id="inv-stock" type="number" min="0" required placeholder="Stock inicial" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-mono text-body-sm px-gutter-sm py-gutter-xs">' +
            '<input id="inv-min" type="number" min="0" value="2" placeholder="Mínimo" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-mono text-body-sm px-gutter-sm py-gutter-xs">' +
            '<input id="inv-unidad" type="text" value="unid" placeholder="Unidad" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '</div>' +
          '<button type="submit" id="btn-add-inv-submit" class="w-full min-h-[38px] rounded-md bg-primary text-on-primary font-label text-label-sm">Guardar insumo</button>' +
        '</form>' +
      '</details>';

    const listHtml = (!inventario || inventario.length === 0)
      ? '<p class="font-body text-body-sm text-on-surface-variant">No hay insumos registrados en la bodega de esta comunidad.</p>'
      : inventario.map(function (item) {
          const low = item.stockActual <= item.stockMinimo;
          const badgeCls = low ? 'bg-error-container text-on-error-container' : 'bg-success-container text-on-success-container';
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-center justify-between gap-gutter-sm">' +
              '<div class="flex flex-col gap-gutter-xs min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(item.producto) + '</span>' +
                '<span class="font-label text-[11px] text-on-surface-variant">Mínimo: ' + item.stockMinimo + ' ' + escapeHtml(item.unidad) + '</span>' +
              '</div>' +
              '<div class="flex items-center gap-gutter-xs shrink-0">' +
                '<button type="button" data-inv-edif="' + escapeHtml(item.edificioId) + '" data-inv-id="' + escapeHtml(item.id) + '" data-inv-delta="-1" class="btn-inv-adj w-9 h-9 rounded-md bg-surface-card border border-outline font-title text-title-md text-on-surface">-</button>' +
                '<span class="px-gutter-sm py-1 rounded-md ' + badgeCls + ' font-mono text-mono-sm min-w-[56px] text-center">' + item.stockActual + ' ' + escapeHtml(item.unidad) + '</span>' +
                '<button type="button" data-inv-edif="' + escapeHtml(item.edificioId) + '" data-inv-id="' + escapeHtml(item.id) + '" data-inv-delta="1" class="btn-inv-adj w-9 h-9 rounded-md bg-surface-card border border-outline font-title text-title-md text-on-surface">+</button>' +
              '</div>' +
            '</article>'
          );
        }).join('');

    container.innerHTML = formHtml + listHtml;

    const form = document.getElementById('admin-add-inv-form');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!requireSelectedAdminBuilding()) return;
        const btn = document.getElementById('btn-add-inv-submit');
        setLoadingBtn(btn, true, 'Guardando...');
        const res = await postApi({
          action: 'saveInventoryItem',
          token: state.session.token,
          edificioId: state.edificioId,
          producto: document.getElementById('inv-producto').value.trim(),
          stockActual: Number(document.getElementById('inv-stock').value || 0),
          stockMinimo: Number(document.getElementById('inv-min').value || 1),
          unidad: document.getElementById('inv-unidad').value.trim() || 'unid',
        });
        setLoadingBtn(btn, false, 'Guardar insumo');
        if (!res.ok) {
          showToast(res.error || 'No se pudo guardar insumo', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
      });
    }

    container.querySelectorAll('.btn-inv-adj').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        const row = btn.closest('article');
        const adjBtns = row ? row.querySelectorAll('.btn-inv-adj') : [btn];
        adjBtns.forEach(function (b) { b.disabled = true; });
        try {
          const res = await postApi({
            action: 'saveInventoryItem',
            token: state.session.token,
            edificioId: btn.getAttribute('data-inv-edif') || state.edificioId,
            itemId: btn.getAttribute('data-inv-id'),
            delta: Number(btn.getAttribute('data-inv-delta')),
          });
          if (!res.ok) {
            showToast(res.error || 'Error al ajustar stock', true);
            return;
          }
          showToast(res.message);
          loadAdminPanelData();
        } finally {
          adjBtns.forEach(function (b) { b.disabled = false; });
        }
      });
    });
  }

  function renderAdminOrdenes(ordenes, equipos) {
    const container = document.getElementById('admin-tab-ordenes');
    if (!container) return;

    const eqOptions = (equipos || []).map(function (eq) {
      return '<option value="' + escapeHtml(eq.equipoId) + '">' + escapeHtml(eq.nombre) + ' (#' + escapeHtml(eq.equipoId) + ')</option>';
    }).join('');

    const formHtml =
      '<form id="admin-add-order-form" class="bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
        '<span class="font-title text-title-sm text-on-surface">Nueva Orden de Trabajo</span>' +
        '<select id="ord-equipo" required class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          (eqOptions || '<option value="GENERAL">General</option>') +
        '</select>' +
        '<input id="ord-titulo" type="text" required placeholder="Título (ej. Revisar fuga en válvula 2)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
        '<textarea id="ord-detalle" rows="2" placeholder="Instrucciones para el técnico o conserje..." class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs"></textarea>' +
        '<div class="grid grid-cols-2 gap-gutter-xs">' +
          '<select id="ord-prioridad" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
            '<option value="Normal">Prioridad Normal</option>' +
            '<option value="Urgente">Prioridad Urgente</option>' +
          '</select>' +
          '<button type="submit" id="btn-add-order-submit" class="min-h-[38px] rounded-md bg-primary text-on-primary font-label text-label-sm">Asignar Orden</button>' +
        '</div>' +
      '</form>';

    const pendientes = (ordenes || []).filter(function (o) {
      return o.estado.toLowerCase() !== 'completada';
    });

    const listHtml = pendientes.length === 0
      ? '<p class="font-body text-body-sm text-on-surface-variant">No hay órdenes de trabajo pendientes.</p>'
      : pendientes.map(function (o) {
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-center justify-between gap-gutter-sm">' +
              '<div class="flex flex-col gap-gutter-xs min-w-0">' +
                '<span class="font-mono text-mono-sm text-on-surface-variant">' + escapeHtml(o.id) + ' · #' + escapeHtml(o.equipoId) + ' · ' + escapeHtml(o.prioridad) + '</span>' +
                '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(o.titulo) + '</span>' +
              '</div>' +
              '<button type="button" data-admin-complete-order="' + escapeHtml(o.id) + '" class="px-gutter-sm py-gutter-xs rounded-md bg-success-container text-on-success-container font-label text-label-sm shrink-0">Listo</button>' +
            '</article>'
          );
        }).join('');

    container.innerHTML = formHtml + listHtml;

    const form = document.getElementById('admin-add-order-form');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!requireSelectedAdminBuilding()) return;
        const btn = document.getElementById('btn-add-order-submit');
        setLoadingBtn(btn, true, 'Enviando...');
        const res = await postApi({
          action: 'addOrder',
          token: state.session.token,
          edificioId: state.edificioId,
          equipoId: document.getElementById('ord-equipo').value,
          titulo: document.getElementById('ord-titulo').value.trim(),
          detalle: document.getElementById('ord-detalle').value.trim(),
          prioridad: document.getElementById('ord-prioridad').value,
        });
        setLoadingBtn(btn, false, 'Asignar Orden');
        if (!res.ok) {
          showToast(res.error || 'Error al crear orden', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
        loadData();
      });
    }

    container.querySelectorAll('[data-admin-complete-order]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const res = await postApi({
            action: 'completeOrder',
            token: state.session.token,
            orderId: btn.getAttribute('data-admin-complete-order'),
          });
          if (!res.ok) {
            showToast(res.error || 'Error', true);
            return;
          }
          showToast(res.message);
          loadAdminPanelData();
          loadData();
        } finally {
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });
  }

  function renderAdminCotizaciones(cotizaciones, equipos) {
    const container = document.getElementById('admin-tab-cotizaciones');
    if (!container) return;

    const eqOptions = '<option value="GENERAL">General Comunidad</option>' + (equipos || []).map(function (eq) {
      return '<option value="' + escapeHtml(eq.equipoId) + '">' + escapeHtml(eq.nombre) + ' (#' + escapeHtml(eq.equipoId) + ')</option>';
    }).join('');

    let quoteFileBase64 = '';
    let quoteFileMime = '';

    const formHtml =
      '<form id="admin-add-quote-form" class="bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
        '<span class="font-title text-title-sm text-on-surface">Subir Cotización para Comité</span>' +
        '<div class="grid grid-cols-2 gap-gutter-xs">' +
          '<select id="cot-equipo" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' + eqOptions + '</select>' +
          '<input id="cot-monto" type="number" min="0" step="1000" required placeholder="Monto CLP" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-mono text-body-sm px-gutter-sm py-gutter-xs">' +
        '</div>' +
        '<input id="cot-proveedor" type="text" required placeholder="Proveedor (ej. TK Elevator)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
        '<textarea id="cot-desc" rows="2" required placeholder="Descripción del trabajo cotizado..." class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs"></textarea>' +
        '<div class="grid grid-cols-2 gap-gutter-xs">' +
          '<input id="cot-file-input" type="file" accept="application/pdf,image/*" class="hidden">' +
          '<button type="button" id="btn-cot-file" class="min-h-[38px] rounded-md border border-dashed border-primary bg-primary-container text-on-primary-container font-label text-label-sm truncate px-2">Adjuntar PDF/Foto</button>' +
          '<button type="submit" id="btn-add-quote-submit" class="min-h-[38px] rounded-md bg-primary text-on-primary font-label text-label-sm">Publicar</button>' +
        '</div>' +
      '</form>';

    container.innerHTML = formHtml + renderQuotesCardsHtml(cotizaciones, true);
    bindQuoteStatusButtons(container, loadAdminPanelData);

    const fileBtn = document.getElementById('btn-cot-file');
    const fileInput = document.getElementById('cot-file-input');
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', async function (e) {
        const f = e.target.files[0];
        if (!f) return;
        try {
          if (f.type && f.type.startsWith('image/')) {
            const comp = await compressImage(f, 1280, 0.8);
            quoteFileBase64 = comp.dataUrl;
            quoteFileMime = 'image/jpeg';
          } else {
            if (f.size > 6 * 1024 * 1024) {
              showToast('El archivo supera los 6 MB permitidos', true);
              e.target.value = '';
              return;
            }
            quoteFileBase64 = await readFileAsDataUrl(f);
            quoteFileMime = f.type || 'application/pdf';
          }
          fileBtn.textContent = f.name;
        } catch (err) {
          showToast('No se pudo procesar "' + f.name + '". Usa formato PDF, JPG o PNG.', true);
          e.target.value = '';
        }
      });
    }

    const form = document.getElementById('admin-add-quote-form');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!requireSelectedAdminBuilding()) return;
        const btn = document.getElementById('btn-add-quote-submit');
        setLoadingBtn(btn, true, 'Subiendo...');
        const res = await postApi({
          action: 'addQuote',
          token: state.session.token,
          edificioId: state.edificioId,
          equipoId: document.getElementById('cot-equipo').value,
          proveedor: document.getElementById('cot-proveedor').value.trim(),
          descripcion: document.getElementById('cot-desc').value.trim(),
          montoClp: Number(document.getElementById('cot-monto').value || 0),
          archivoBase64: quoteFileBase64,
          archivoMimeType: quoteFileMime,
        });
        setLoadingBtn(btn, false, 'Publicar');
        if (!res.ok) {
          showToast(res.error || 'Error al subir cotización', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
      });
    }
  }

  let sigHasStroke = false;
  function setupSignaturePad() {
    const canvas = document.getElementById('maint-sig-canvas');
    const clearBtn = document.getElementById('btn-clear-sig');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0F2942';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;
    function getPos(ev) {
      const rect = canvas.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function start(ev) {
      drawing = true;
      sigHasStroke = true;
      const p = getPos(ev);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function move(ev) {
      if (!drawing) return;
      ev.preventDefault();
      const p = getPos(ev);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    function stop() {
      drawing = false;
    }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);

    if (clearBtn) {
      clearBtn.addEventListener('click', clearSignaturePad);
    }
  }

  function clearSignaturePad() {
    const canvas = document.getElementById('maint-sig-canvas');
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    sigHasStroke = false;
  }

  function getSignatureDataUrl() {
    if (!sigHasStroke) return '';
    const canvas = document.getElementById('maint-sig-canvas');
    return canvas ? canvas.toDataURL('image/png') : '';
  }

  async function deliverGeneratedPdf(res, fallbackName, shareTitle) {
    const fileName = (res && res.fileName) || fallbackName || 'Documento_GCO.pdf';
    if (res && res.pdfBase64) {
      try {
        const blob = base64ToPdfBlob(res.pdfBase64);
        const isTouchMobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (isTouchMobile && navigator.share && typeof File !== 'undefined') {
          try {
            const file = new File([blob], fileName, { type: 'application/pdf' });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: shareTitle || fileName,
                text: (shareTitle || 'Documento GCO') + (res.linkPdf ? '\nRespaldo Drive: ' + res.linkPdf : ''),
                files: [file],
              });
              return true;
            }
          } catch (shErr) {
            if (shErr && shErr.name === 'AbortError') return true;
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        return true;
      } catch (e) {}
    }
    const target = res && (res.downloadUrl || res.linkPdf);
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }

  async function buildQrDataUrl(text) {
    if (typeof QRCode === 'undefined') return '';
    try {
      const canvas = await createBrandedQrCanvas(text, 168);
      return canvas ? canvas.toDataURL('image/png') : '';
    } catch (e) {
      return '';
    }
  }

  async function printMaintenanceReceipt(m, triggerBtn) {
    if (!state.data || !m) return;
    const eq = state.data.equipo;
    const edif = state.data.edificio;
    const qrUrl = 'https://gcoadmin.cl/app/?edificio=' + encodeURIComponent(edif.id) + '&equipo=' + encodeURIComponent(eq.id);
    const prevHtml = triggerBtn ? triggerBtn.innerHTML : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '<span class="material-symbols-outlined text-[15px]">hourglass_top</span>Generando PDF...';
    }
    const qrDataUrl = await buildQrDataUrl(qrUrl);
    try {
      const res = await postApi({
        action: 'saveReceiptPdf',
        edificioId: edif.id,
        equipoId: eq.id,
        maintId: m.id,
        edificioNombre: edif.nombre,
        equipoNombre: eq.nombre,
        fecha: formatShortDate(m.fecha),
        tipo: m.tipo,
        estadoResultante: m.estadoResultante,
        tecnico: m.tecnico || eq.empresa,
        observaciones: m.observaciones,
        qrDataUrl: qrDataUrl,
      });
      if (!res.ok) throw new Error(res.error || 'No se pudo generar el comprobante PDF.');
      await deliverGeneratedPdf(res, 'Comprobante_' + eq.id + '.pdf', 'Comprobante de Mantención · ' + eq.nombre);
      showToast('Comprobante PDF con QR descargado.', false);
    } catch (err) {
      showToast(err.message || 'Error al generar comprobante PDF.', true);
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = prevHtml;
      }
    }
  }

  async function printCommitteeReport(data) {
    if (!state.session || !state.session.token) {
      showToast('Inicia sesión como Comité o Administrador para emitir el acta.', true);
      return;
    }
    const btn = document.getElementById('btn-print-committee');
    const lbl = document.getElementById('committee-pdf-btn-label');
    const prevLabel = lbl ? lbl.textContent : '';
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Generando Acta PDF...';

    try {
      const edificioId = (data && data.edificio && data.edificio.id) || state.edificioId;
      const res = await postApi({
        action: 'saveCommitteePdf',
        token: state.session.token,
        edificioId: edificioId,
      });
      if (!res.ok) throw new Error(res.error || 'No se pudo generar el Acta PDF.');
      await deliverGeneratedPdf(res, 'Acta_Comite_' + edificioId + '.pdf', 'Acta Ejecutiva Comité · ' + ((data && data.edificio && data.edificio.nombre) || edificioId));
      showToast('Acta PDF generada y respaldada en Drive y Documentos.', false);
    } catch (err) {
      showToast(err.message || 'Error al generar Acta PDF.', true);
    } finally {
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = prevLabel || 'Guardar y Descargar Acta PDF';
    }
  }

  function renderAdminUsers(usuarios) {
    const container = document.getElementById('admin-tab-usuarios');

    const createBoxHtml =
      '<details class="bg-surface-subtle rounded-lg border border-outline p-gutter-md">' +
        '<summary class="font-title text-title-sm text-primary cursor-pointer flex items-center justify-between">' +
          '<span class="inline-flex items-center gap-gutter-xs"><span class="material-symbols-outlined text-[18px]">person_add</span>Crear usuario y enviar clave provisoria</span>' +
          '<span class="material-symbols-outlined text-[18px]">expand_more</span>' +
        '</summary>' +
        '<form id="admin-create-user-form" class="flex flex-col gap-gutter-sm mt-gutter-md">' +
          '<input id="new-usr-name" type="text" required placeholder="Nombre completo" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '<input id="new-usr-email" type="email" required placeholder="Correo electrónico" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '<div class="grid grid-cols-2 gap-gutter-xs">' +
            '<select id="new-usr-role" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
              '<option value="comite">Comité</option>' +
              '<option value="operaciones">Operaciones (Terreno)</option>' +
              '<option value="tecnico">Técnico</option>' +
              '<option value="admin">Admin edificio</option>' +
              '<option value="vecino">Vecino</option>' +
            '</select>' +
            '<input id="new-usr-extra" type="text" placeholder="Cargo / Empresa / Depto" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '</div>' +
          '<input id="new-usr-equipos" type="text" placeholder="Equipos asignados (solo técnicos, ej. BMB-01,EST-AGUA)" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '<button type="submit" id="btn-create-usr-submit" class="w-full min-h-[40px] rounded-md bg-primary text-on-primary font-label text-label-md">Crear y enviar clave por correo</button>' +
        '</form>' +
      '</details>';

    const pendientes = usuarios.filter(function (u) {
      return u.estado === 'pendiente';
    });

    const tempPending = usuarios.filter(function (u) {
      return u.estado === 'cambio_clave';
    });

    const pendientesHtml = pendientes.length === 0
      ? '<p class="font-body text-body-sm text-on-surface-variant">No hay solicitudes pendientes de aprobación.</p>'
      : pendientes.map(function (u) {
          return (
            '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex items-center justify-between gap-gutter-md">' +
              '<div class="flex flex-col gap-gutter-xs min-w-0">' +
                '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(u.nombre) + '</span>' +
                '<span class="font-label text-label-sm text-on-surface-variant truncate">' + escapeHtml(u.rol.toUpperCase()) + ' · ' + escapeHtml(u.deptoOEmpresa || u.email) + '</span>' +
              '</div>' +
              '<button type="button" data-approve-user="' + escapeHtml(u.id) + '" class="px-gutter-md py-gutter-xs rounded-md bg-success-container text-on-success-container font-label text-label-sm shrink-0">Aprobar</button>' +
            '</article>'
          );
        }).join('');

    const tempHtml = tempPending.length === 0
      ? ''
      : '<div class="flex flex-col gap-gutter-xs pt-gutter-xs">' +
          '<span class="font-label text-label-sm text-on-surface-variant">Esperando cambio de clave provisoria (' + tempPending.length + ')</span>' +
          tempPending.map(function (u) {
            return (
              '<article class="w-full bg-surface-subtle rounded-md border border-outline px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm">' +
                '<span class="font-body text-body-sm text-on-surface truncate">' + escapeHtml(u.nombre) + ' (' + escapeHtml(u.rol) + ')</span>' +
                '<span class="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm shrink-0">Clave provisoria</span>' +
              '</article>'
            );
          }).join('') +
        '</div>';

    container.innerHTML = createBoxHtml + pendientesHtml + tempHtml;

    const createForm = document.getElementById('admin-create-user-form');
    if (createForm) {
      createForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('btn-create-usr-submit');
        setLoadingBtn(btn, true, 'Enviando...');
        const res = await postApi({
          action: 'adminCreateUser',
          token: state.session.token,
          edificioId: state.edificioId,
          nombre: document.getElementById('new-usr-name').value.trim(),
          email: document.getElementById('new-usr-email').value.trim(),
          rol: document.getElementById('new-usr-role').value,
          deptoOEmpresa: document.getElementById('new-usr-extra').value.trim(),
          equiposAsignados: (document.getElementById('new-usr-equipos') ? document.getElementById('new-usr-equipos').value.trim() : ''),
        });
        setLoadingBtn(btn, false, 'Crear y enviar clave por correo');
        if (!res.ok) {
          showToast(res.error || 'No se pudo crear usuario', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
      });
    }

    container.querySelectorAll('[data-approve-user]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const userId = btn.getAttribute('data-approve-user');
        const res = await postApi({
          action: 'approveUser',
          token: state.session.token,
          userId: userId,
          estado: 'activo',
        });
        if (!res.ok) {
          showToast(res.error || 'No se pudo aprobar', true);
          return;
        }
        showToast('Usuario aprobado');
        loadAdminPanelData();
      });
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      let swReloading = false;
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || swReloading) return;
        swReloading = true;
        window.location.reload();
      });
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () {});
      }).catch(function () {});
    }
    setupInstallPrompt();
  }

  let deferredInstallPrompt = null;
  function setupInstallPrompt() {
    const btn = document.getElementById('btn-install-app');
    if (!btn) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    if (isIos) {
      btn.classList.remove('hidden');
      btn.classList.add('inline-flex');
      btn.addEventListener('click', function () {
        showToast('En iPhone/iPad: toca Compartir (↑) y luego "Agregar a inicio"');
      });
      return;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      btn.classList.remove('hidden');
      btn.classList.add('inline-flex');
    });

    btn.addEventListener('click', async function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        btn.classList.add('hidden');
        btn.classList.remove('inline-flex');
        showToast('Instalando GCO App...');
      }
      deferredInstallPrompt = null;
    });

    window.addEventListener('appinstalled', function () {
      btn.classList.add('hidden');
      btn.classList.remove('inline-flex');
      deferredInstallPrompt = null;
    });
  }

  function loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveOfflineQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch (e) {}
    updateOfflineBanner();
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    const text = document.getElementById('offline-banner-text');
    if (!banner || !text) return;
    const q = loadOfflineQueue();
    if (!navigator.onLine) {
      text.textContent = q.length > 0
        ? 'Sin señal · ' + q.length + ' envío(s) pendiente(s) al reconectar'
        : 'Sin señal · Mostrando última información guardada';
      banner.classList.remove('hidden');
      banner.classList.add('flex');
    } else if (q.length > 0) {
      text.textContent = 'Sincronizando ' + q.length + ' envío(s) pendiente(s)...';
      banner.classList.remove('hidden');
      banner.classList.add('flex');
    } else {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
    }
  }

  let isSyncingQueue = false;
  async function syncOfflineQueue() {
    if (isSyncingQueue) return;
    const queue = loadOfflineQueue();
    if (queue.length === 0 || !navigator.onLine) return;

    isSyncingQueue = true;
    const remaining = [];
    let syncedCount = 0;
    let droppedError = '';
    let authNeeded = false;

    try {
      for (let i = 0; i < queue.length; i++) {
        const item = Object.assign({}, queue[i]);
        if (item.token && state.session && state.session.token) {
          item.token = state.session.token;
        }
        try {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(item),
          });
          const json = await res.json();
          if (json && json.ok) {
            syncedCount++;
          } else {
            const errMsg = (json && json.error) ? String(json.error) : '';
            if (/sesi[oó]n|token|expir/i.test(errMsg)) {
              authNeeded = true;
              remaining.push(item);
            } else {
              item._retries = (item._retries || 0) + 1;
              if (item._retries < 3) {
                remaining.push(item);
              } else {
                droppedError = errMsg || 'Datos rechazados por el servidor';
              }
            }
          }
        } catch (err) {
          remaining.push(item);
        }
      }
    } finally {
      isSyncingQueue = false;
    }

    saveOfflineQueue(remaining);
    if (syncedCount > 0) {
      showToast('Se sincronizaron ' + syncedCount + ' registro(s) pendientes');
      loadData();
    } else if (authNeeded) {
      showToast('Inicia sesión nuevamente para enviar ' + remaining.length + ' registro(s) en cola.', true);
    } else if (droppedError) {
      showToast('Envío descartado tras 3 intentos: ' + droppedError, true);
    }
  }

  async function postApi(payload) {
    const queueable = ['createTicket', 'addMaintenance', 'updateTicket', 'saveRondaReport'].indexOf(payload.action) !== -1;

    if (!navigator.onLine && queueable) {
      const q = loadOfflineQueue();
      q.push(payload);
      saveOfflineQueue(q);
      return { ok: true, queued: true, message: 'Sin señal: guardado en el celular. Se enviará al reconectar.' };
    }

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err) {
      if (queueable) {
        const q = loadOfflineQueue();
        q.push(payload);
        saveOfflineQueue(q);
        return { ok: true, queued: true, message: 'Sin señal: guardado en el celular. Se enviará al reconectar.' };
      }
      return { ok: false, error: 'Error de conexión al enviar datos.' };
    }
  }

  function compressImage(file, maxWidth, quality) {
    return new Promise(function (resolve, reject) {
      const urlApi = window.URL || window.webkitURL;
      const useObjUrl = Boolean(urlApi && urlApi.createObjectURL);
      const img = new Image();
      let objUrl = '';

      function drawAndResolve() {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) throw new Error('Dimensiones inválidas');
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const approxBytes = Math.round((dataUrl.length * 3) / 4);
          if (objUrl) urlApi.revokeObjectURL(objUrl);
          resolve({ dataUrl: dataUrl, bytes: approxBytes });
        } catch (err) {
          if (objUrl) urlApi.revokeObjectURL(objUrl);
          reject(err);
        }
      }

      img.onload = drawAndResolve;
      img.onerror = function () {
        if (objUrl) urlApi.revokeObjectURL(objUrl);
        // Fallback con FileReader si ObjectURL falla
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function (ev) {
          const fallbackImg = new Image();
          fallbackImg.onerror = reject;
          fallbackImg.onload = function () {
            img.src = '';
            let w = fallbackImg.naturalWidth || fallbackImg.width;
            let h = fallbackImg.naturalHeight || fallbackImg.height;
            if (w > maxWidth) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(fallbackImg, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({ dataUrl: dataUrl, bytes: Math.round((dataUrl.length * 3) / 4) });
          };
          fallbackImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };

      if (useObjUrl) {
        objUrl = urlApi.createObjectURL(file);
        img.src = objUrl;
      } else {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function (ev) {
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function (ev) {
        resolve(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
  }

  let toastTimer = null;
  function showToast(msg, isError) {
    const toast = document.getElementById('feedback-toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    toastMsg.textContent = msg;
    toastIcon.textContent = isError ? 'error' : 'check_circle';
    toastIcon.className = isError
      ? 'material-symbols-outlined text-[18px] text-error shrink-0'
      : 'material-symbols-outlined text-[18px] text-success shrink-0';

    toast.classList.remove('hidden');
    toast.classList.add('flex');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, 3200);
  }

  function setLoadingBtn(btn, loading, text) {
    btn.disabled = loading;
    const span = btn.querySelector('span:last-child');
    if (span && text) span.textContent = text;
  }

  function formatShortDate(str) {
    if (!str || str === 'Sin registros' || str === 'Por programar') return str || '--';
    const raw = String(str).trim();
    if (raw.indexOf('Ronda ') === 0) {
      return 'Ronda ' + formatShortDate(raw.slice(6));
    }
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);
      if (m >= 0 && m < 12 && day >= 1 && day <= 31) {
        return String(day).padStart(2, '0') + ' ' + meses[m] + ' ' + y;
      }
    }
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return String(d.getDate()).padStart(2, '0') + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
  }

  function guessEquipmentIcon(nombre, id) {
    const t = (String(nombre) + ' ' + String(id))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (t.includes('ascensor') || t.includes('asc')) return 'elevator';
    if (t.includes('estanque')) return 'water_drop';
    if (t.includes('bomba') || t.includes('agua') || t.includes('bmb')) return 'water_pump';
    if (t.includes('generador') || t.includes('gen')) return 'power';
    if (t.includes('electr') || t.includes('tablero')) return 'bolt';
    if (t.includes('basura') || t.includes('recicl')) return 'recycling';
    if (t.includes('pasillo')) return 'sensor_door';
    if (t.includes('caldera') || t.includes('clima')) return 'local_fire_department';
    if (t.includes('piscina')) return 'pool';
    if (t.includes('conserj')) return 'support_agent';
    if (t.includes('estacionamiento') || t.includes('parking')) return 'local_parking';
    if (t.includes('escala') || t.includes('escalera')) return 'stairs';
    if (t.includes('porton') || t.includes('prt')) return 'garage';
    if (t.includes('jardin') || t.includes('riego')) return 'local_florist';
    if (t.includes('quincho') || t.includes('evento') || t.includes('asado')) return 'outdoor_grill';
    if (t.includes('gimnasio') || t.includes('gym')) return 'fitness_center';
    if (t.includes('camara') || t.includes('cctv')) return 'videocam';
    if (t.includes('lavander')) return 'local_laundry_service';
    if (t.includes('extintor') || t.includes('incendio') || t.includes('red humeda') || t.includes('red seca')) return 'fire_extinguisher';
    if (t.includes('citofon') || t.includes('acceso')) return 'doorbell';
    if (t.includes('gas') || t.includes('sello')) return 'propane_tank';
    if (t.includes('cert')) return 'verified';
    return 'precision_manufacturing';
  }

  function splitLinks(raw) {
    if (!raw) return [];
    return String(raw)
      .split(' | ')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ==========================================================================
     INFORME DE RONDA DE JORNADA (CHECKLIST + VOZ + IA + FOTOS + PDF COMITÉ)
     ========================================================================== */

  function getRondaDraftKey() {
    return 'gco_ronda_draft_v1_' + (state.edificioId || 'DEMO');
  }

  function getTodayIsoLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function loadRondaDraft() {
    try {
      const raw = localStorage.getItem(getRondaDraftKey());
      state.rondaItems = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.rondaItems = [];
    }
  }

  function getTodayRondaStatusMap(edificioId) {
    const edif = edificioId || state.edificioId || 'DEMO';
    const today = getTodayIsoLocal();
    let rawItems = [];
    if (String(edif) === String(state.edificioId) && Array.isArray(state.rondaItems) && state.rondaItems.length > 0) {
      rawItems = state.rondaItems;
    } else {
      try {
        const raw = localStorage.getItem('gco_ronda_draft_v1_' + edif);
        rawItems = raw ? JSON.parse(raw) : [];
      } catch (e) {
        rawItems = [];
      }
    }
    const items = (Array.isArray(rawItems) ? rawItems : []).filter(function (it) {
      return it && it.espacio && (!it.fechaCarpeta || it.fechaCarpeta === today);
    });
    const byAreaLower = {};
    const byEqIdLower = {};
    items.forEach(function (it, idx) {
      const esp = String(it.espacio || '').trim();
      byAreaLower[esp.toLowerCase()] = { item: it, idx: idx };
      const m = esp.match(/\(#([^)]+)\)/);
      if (m && m[1]) {
        byEqIdLower[String(m[1]).trim().toLowerCase()] = { item: it, idx: idx };
      }
    });
    return { items: items, byAreaLower: byAreaLower, byEqIdLower: byEqIdLower };
  }

  function renderDirectoryRondaBanner(data, isOpsOrAdmin, todayRonda) {
    const banner = document.getElementById('dir-ronda-banner');
    if (!banner) return;
    if (!isOpsOrAdmin || !data || !data.edificio) {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
      return;
    }
    const opts = getRondaAreaOptions();
    const total = opts.length || 0;
    const statusMap = todayRonda || getTodayRondaStatusMap(data.edificio.id);
    let reviewed = 0;
    opts.forEach(function (o) {
      if (statusMap.byAreaLower[o.toLowerCase()]) reviewed++;
    });
    const pct = total > 0 ? Math.min(100, Math.round((reviewed / total) * 100)) : 0;

    const titleEl = document.getElementById('dir-ronda-title');
    const subEl = document.getElementById('dir-ronda-sub');
    const barEl = document.getElementById('dir-ronda-bar');
    const btnLbl = document.getElementById('btn-dir-open-ronda-label');

    if (titleEl) titleEl.textContent = 'Ronda de hoy: ' + reviewed + ' de ' + total + ' espacios (' + pct + '%)';
    if (subEl) {
      if (total > 0 && reviewed >= total) {
        subEl.textContent = '✓ ¡Recorrido completo! Ya puedes generar y guardar el PDF para el Comité';
      } else if (reviewed > 0) {
        subEl.textContent = 'Faltan ' + (total - reviewed) + ' espacio(s) por revisar · Los revisados muestran ✓ verde';
      } else {
        subEl.textContent = 'Toca "Iniciar ronda" para ver el recorrido completo y marcar cada espacio con ✓';
      }
    }
    if (barEl) barEl.style.width = pct + '%';
    if (btnLbl) btnLbl.textContent = reviewed > 0 ? 'Continuar ronda' : 'Iniciar ronda';

    banner.classList.remove('hidden');
    banner.classList.add('flex');
  }

  function saveRondaDraft() {
    // Para ítems ya respaldados en Drive, no guardamos el base64 pesado en localStorage
    // (ya tenemos fotoFileIds y fotoUrls), evitando llenar el límite de 5 MB en rondas largas.
    const toStore = state.rondaItems.map(function (it) {
      const alreadyInDrive = it.backupStatus === 'backed_up' && it.fotoFileIds && it.fotoFileIds.length > 0;
      return {
        id: it.id,
        espacio: it.espacio,
        estado: it.estado,
        checks: it.checks,
        notas: it.notas,
        crearOrden: Boolean(it.crearOrden),
        fotos: alreadyInDrive ? [] : (it.fotos || []),
        fotoUrls: it.fotoUrls || [],
        fotoFileIds: it.fotoFileIds || [],
        fechaCarpeta: it.fechaCarpeta || getTodayIsoLocal(),
        backupStatus: it.backupStatus || 'none',
        hora: it.hora,
      };
    });
    try {
      localStorage.setItem(getRondaDraftKey(), JSON.stringify(toStore));
    } catch (e) {
      // Si aún así supera 5 MB (muchas fotos tomadas offline), conservamos IDs/URLs de Drive y textos.
      try {
        const light = toStore.map(function (it) {
          return Object.assign({}, it, { fotos: [] });
        });
        localStorage.setItem(getRondaDraftKey(), JSON.stringify(light));
      } catch (e2) {}
    }
    if (state.data && state.data.mode === 'edificio') {
      const dirView = document.getElementById('view-directory');
      if (dirView && !dirView.classList.contains('hidden')) {
        renderDirectoryView(state.data);
      }
    }
  }

  async function backupRondaItemPhotos(item) {
    if (!item || !item.fotos || item.fotos.length === 0) {
      if (item) item.backupStatus = 'none';
      return true;
    }
    if (item.backupStatus === 'backed_up' && item.fotoFileIds && item.fotoFileIds.length > 0) {
      return true;
    }
    if (item.backupStatus === 'uploading') return false;
    if (!navigator.onLine || !state.session || !state.session.token || !state.edificioId) {
      item.backupStatus = 'pending';
      saveRondaDraft();
      renderRondaItemsList();
      return false;
    }

    item.backupStatus = 'uploading';
    renderRondaItemsList();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'uploadRondaPhotos',
          token: state.session.token,
          edificioId: state.edificioId,
          fechaCarpeta: item.fechaCarpeta || getTodayIsoLocal(),
          espacio: item.espacio,
          hora: item.hora || '',
          fotos: item.fotos,
        }),
      });
      const json = await res.json();
      if (json && json.ok) {
        item.fotoUrls = Array.isArray(json.urls) ? json.urls : [];
        item.fotoFileIds = Array.isArray(json.fileIds) ? json.fileIds : [];
        item.backupStatus = 'backed_up';
        saveRondaDraft();
        renderRondaItemsList();
        return true;
      }
      item.backupStatus = 'pending';
      saveRondaDraft();
      renderRondaItemsList();
      return false;
    } catch (err) {
      item.backupStatus = 'pending';
      saveRondaDraft();
      renderRondaItemsList();
      return false;
    }
  }

  async function syncPendingRondaPhotos() {
    if (!navigator.onLine || !state.session || !state.session.token || !state.edificioId) return;
    if (!state.rondaItems || state.rondaItems.length === 0) return;
    for (let i = 0; i < state.rondaItems.length; i++) {
      const it = state.rondaItems[i];
      if (it && it.fotos && it.fotos.length > 0 && it.backupStatus !== 'backed_up') {
        await backupRondaItemPhotos(it);
      }
    }
  }

  function getRondaAreaOptions() {
    const opts = [];
    const seen = {};

    if (state.data && state.data.equipos && state.data.equipos.length > 0) {
      state.data.equipos.forEach(function (eq) {
        const lbl = eq.nombre + ' (#' + eq.id + ')';
        seen[lbl.toLowerCase()] = true;
        opts.push(lbl);
      });
    } else if (state.data && state.data.equipo) {
      const lbl = state.data.equipo.nombre + ' (#' + state.data.equipo.id + ')';
      seen[lbl.toLowerCase()] = true;
      opts.push(lbl);
    }

    const normTxt = function (s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };
    const existingNorm = opts.map(normTxt);

    [
      { label: 'Hall de Acceso y Conserjería', keys: ['conserjer', 'hall'] },
      { label: 'Pasillos y Escaleras', keys: ['pasillo', 'escala', 'escalera'] },
      { label: 'Sala de Bombas / Estanques', keys: ['bomba', 'hidropack', 'estanque'] },
      { label: 'Ascensores', keys: ['ascensor', 'elevador'] },
      { label: 'Estacionamientos y Portón', keys: ['estacionamiento', 'porton'] },
      { label: 'Sala de Basura', keys: ['basura', 'shaft'] },
      { label: 'Quincho / Áreas Comunes', keys: ['quincho'] },
      { label: 'Jardines y Perímetro', keys: ['jardin', 'perimetro'] },
    ].forEach(function (gen) {
      if (seen[gen.label.toLowerCase()]) return;
      const alreadyCovered = existingNorm.some(function (ex) {
        return gen.keys.some(function (k) { return ex.indexOf(k) !== -1; });
      });
      if (!alreadyCovered) opts.push(gen.label);
    });

    return opts;
  }

  function populateRondaAreas(preserveValue, autoAdvanceNext) {
    const sel = document.getElementById('ronda-area-select');
    if (!sel) return;
    const prevVal = preserveValue !== undefined ? preserveValue : sel.value;
    const opts = getRondaAreaOptions();
    state.rondaTotalAreas = opts.length;

    const doneSet = {};
    (state.rondaItems || []).forEach(function (it) {
      if (it && it.espacio) doneSet[String(it.espacio).toLowerCase()] = true;
    });

    sel.innerHTML = opts.map(function (o) {
      const isDone = Boolean(doneSet[o.toLowerCase()]);
      const label = (isDone ? '✓ ' : '') + o;
      return '<option value="' + escapeHtml(o) + '">' + escapeHtml(label) + '</option>';
    }).join('');

    if (autoAdvanceNext) {
      const nextPending = opts.find(function (o) { return !doneSet[o.toLowerCase()]; });
      if (nextPending) sel.value = nextPending;
    } else if (prevVal && opts.indexOf(prevVal) !== -1) {
      sel.value = prevVal;
    } else {
      const firstPending = opts.find(function (o) { return !doneSet[o.toLowerCase()]; });
      if (firstPending) sel.value = firstPending;
    }

    updateRondaProgress(opts, doneSet);
    renderRondaVisualMap(opts);
  }

  function renderRondaVisualMap(optsInput) {
    const container = document.getElementById('ronda-visual-map');
    if (!container) return;
    const opts = optsInput || getRondaAreaOptions();
    const sel = document.getElementById('ronda-area-select');
    const currentVal = sel ? sel.value : '';

    const itemByArea = {};
    (state.rondaItems || []).forEach(function (it, idx) {
      if (it && it.espacio) {
        itemByArea[String(it.espacio).toLowerCase()] = { item: it, idx: idx };
      }
    });

    container.innerHTML = opts.map(function (o, i) {
      const hit = itemByArea[o.toLowerCase()];
      const isSelected = o === currentVal;
      const ringCls = isSelected ? ' ring-2 ring-primary' : '';
      let chipCls = 'bg-surface-card text-on-surface border border-outline';
      let iconName = 'radio_button_unchecked';
      let iconCls = 'text-on-surface-variant';

      if (hit && hit.item) {
        const est = String(hit.item.estado || 'Conforme').toLowerCase();
        if (est.indexOf('urg') !== -1) {
          chipCls = 'bg-error-container text-on-error-container border border-error';
          iconName = 'error';
          iconCls = 'text-error';
        } else if (est.indexOf('obs') !== -1) {
          chipCls = 'bg-warning-container text-on-warning-container border border-warning';
          iconName = 'warning';
          iconCls = 'text-warning';
        } else {
          chipCls = 'bg-success-container text-on-success-container border border-success';
          iconName = 'check_circle';
          iconCls = 'text-success';
        }
      }

      const shortLabel = o.replace(/\s*\(#[^)]+\)\s*$/, '');
      return (
        '<button type="button" data-ronda-map-idx="' + i + '" class="inline-flex items-center gap-1 px-2 py-1 rounded-full font-label text-[11px] transition-colors duration-state-change ' + chipCls + ringCls + '">' +
          '<span class="material-symbols-outlined text-[14px] ' + iconCls + '" style="font-variation-settings: \'FILL\' 1;" aria-hidden="true">' + iconName + '</span>' +
          '<span>' + escapeHtml(shortLabel) + '</span>' +
        '</button>'
      );
    }).join('');

    container.querySelectorAll('[data-ronda-map-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = Number(btn.getAttribute('data-ronda-map-idx'));
        const targetArea = opts[idx];
        if (!targetArea) return;
        const hit = itemByArea[targetArea.toLowerCase()];
        if (hit) {
          startEditRondaItem(hit.idx);
        } else {
          state.rondaEditingIdx = -1;
          if (sel) sel.value = targetArea;
          renderRondaVisualMap(opts);
        }
      });
    });
  }

  function updateRondaProgress(optsInput, doneSetInput) {
    const opts = optsInput || getRondaAreaOptions();
    const doneSet = doneSetInput || {};
    if (!doneSetInput) {
      (state.rondaItems || []).forEach(function (it) {
        if (it && it.espacio) doneSet[String(it.espacio).toLowerCase()] = true;
      });
    }
    let reviewed = 0;
    opts.forEach(function (o) {
      if (doneSet[o.toLowerCase()]) reviewed++;
    });
    const total = opts.length || 1;
    const pct = Math.min(100, Math.round((reviewed / total) * 100));
    const txt = document.getElementById('ronda-progress-text');
    const pctEl = document.getElementById('ronda-progress-pct');
    const bar = document.getElementById('ronda-progress-bar');
    if (txt) txt.textContent = 'Revisados ' + reviewed + ' de ' + opts.length + ' espacios';
    if (pctEl) pctEl.textContent = pct + '%';
    if (bar) bar.style.width = pct + '%';
  }

  function setRondaStateUI(newState, autoDetected) {
    state.rondaState = newState || 'Conforme';
    document.querySelectorAll('.ronda-state-chip').forEach(function (b) {
      const val = b.getAttribute('data-ronda-state');
      const act = val === state.rondaState;
      let cls = 'bg-surface-card text-on-surface-variant border border-outline';
      if (act) {
        if (val === 'Acción urgente') cls = 'bg-error-container text-on-error-container border border-error';
        else if (val === 'Con observación') cls = 'bg-warning-container text-on-warning-container border border-warning';
        else cls = 'bg-success-container text-on-success-container border border-success';
      }
      b.className = 'ronda-state-chip py-gutter-xs px-gutter-sm rounded-md font-label text-label-sm ' + cls;
    });

    const hint = document.getElementById('ronda-autodetect-hint');
    if (hint) {
      hint.classList.toggle('hidden', !autoDetected);
      if (autoDetected) {
        hint.textContent = state.rondaState === 'Acción urgente' ? 'Detectado: Urgente' : 'Detectado: Observación';
      }
    }

    const chkOrder = document.getElementById('ronda-create-order');
    if (chkOrder && !state.rondaOrderTouched) {
      chkOrder.checked = state.rondaState !== 'Conforme';
    }
  }

  function maybeAutoDetectRondaState() {
    if (state.rondaStateTouched) return;
    const notesEl = document.getElementById('ronda-notes');
    const txt = (notesEl ? notesEl.value : '').toLowerCase();
    const hasProblemChip = state.rondaChecks.some(function (c) {
      return c.indexOf('Filtración') !== -1 || c.indexOf('Requiere mantención') !== -1;
    });

    const urgentRe = /\b(urgente|urgencia|emergencia|peligro|inundaci|sin servicio|no funciona|detenido|cortocircuito|atrapad|incendio)\b/i;
    const obsRe = /\b(compra|comprar|solicita|repuesto|chapa|chapas|manilla|manillas|cerradura|roto|rota|falla|fallando|quemad|filtraci|goteo|fuga|suena|ruido|desgaste|reparar|arreglar|cambiar|reemplazar|mal olor|sucio|sin luz|pendiente)\b/i;

    if (urgentRe.test(txt)) {
      setRondaStateUI('Acción urgente', true);
    } else if (hasProblemChip || obsRe.test(txt)) {
      setRondaStateUI('Con observación', true);
    } else {
      setRondaStateUI('Conforme', false);
    }
  }

  function syncRondaChecksUI() {
    document.querySelectorAll('.ronda-check-chip').forEach(function (b) {
      const val = b.getAttribute('data-rcheck');
      const active = state.rondaChecks.indexOf(val) !== -1;
      b.className = active
        ? 'ronda-check-chip px-gutter-sm py-1 rounded-full bg-primary text-on-primary border border-primary font-label text-[11px]'
        : 'ronda-check-chip px-gutter-sm py-1 rounded-full bg-surface-card border border-outline text-on-surface-variant font-label text-[11px]';
    });
  }

  function resetRondaForm(autoAdvanceNext) {
    state.rondaEditingIdx = -1;
    state.rondaStateTouched = false;
    state.rondaOrderTouched = false;
    state.rondaChecks = [];
    state.rondaPhotos = [];
    const notesEl = document.getElementById('ronda-notes');
    if (notesEl) notesEl.value = '';
    const chkOrder = document.getElementById('ronda-create-order');
    if (chkOrder) chkOrder.checked = false;
    setRondaStateUI('Conforme', false);
    syncRondaChecksUI();
    renderRondaPhotosPreview();
    const addLbl = document.getElementById('ronda-add-btn-label');
    if (addLbl) addLbl.textContent = 'Agregar espacio al informe';
    const cancelBtn = document.getElementById('btn-ronda-cancel-edit');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    populateRondaAreas(undefined, Boolean(autoAdvanceNext));
  }

  function startEditRondaItem(idx) {
    const it = state.rondaItems[idx];
    if (!it) return;
    state.rondaEditingIdx = idx;
    state.rondaStateTouched = true;
    state.rondaOrderTouched = true;
    populateRondaAreas(it.espacio, false);
    const sel = document.getElementById('ronda-area-select');
    if (sel) sel.value = it.espacio;
    setRondaStateUI(it.estado || 'Conforme', false);
    state.rondaChecks = Array.isArray(it.checks) ? it.checks.slice() : [];
    syncRondaChecksUI();
    const notesEl = document.getElementById('ronda-notes');
    if (notesEl) notesEl.value = it.notas || '';
    const chkOrder = document.getElementById('ronda-create-order');
    if (chkOrder) chkOrder.checked = Boolean(it.crearOrden);
    state.rondaPhotos = Array.isArray(it.fotos) ? it.fotos.slice() : [];
    renderRondaPhotosPreview();
    const addLbl = document.getElementById('ronda-add-btn-label');
    if (addLbl) addLbl.textContent = 'Guardar cambios del espacio';
    const cancelBtn = document.getElementById('btn-ronda-cancel-edit');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    const form = document.getElementById('ronda-item-form');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Editando: ' + it.espacio);
  }

  function openRondaModalFlow() {
    const sub = document.getElementById('ronda-building-subtitle');
    if (sub && state.data && state.data.edificio) {
      sub.textContent = state.data.edificio.nombre + ' · Fotos e informe se respaldan en Drive';
    }
    const banner = document.getElementById('ronda-backup-banner');
    if (banner) {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
    }
    state.rondaSavedToDrive = false;
    loadRondaDraft();
    resetRondaForm(false);
    renderRondaItemsList();
    openModal('modal-ronda');
    syncPendingRondaPhotos();
  }

  function bindRondaEvents() {
    const btnOpen = document.getElementById('btn-open-ronda');
    if (btnOpen) {
      btnOpen.addEventListener('click', openRondaModalFlow);
    }

    const btnDirOpen = document.getElementById('btn-dir-open-ronda');
    if (btnDirOpen) {
      btnDirOpen.addEventListener('click', openRondaModalFlow);
    }

    const areaSel = document.getElementById('ronda-area-select');
    if (areaSel) {
      areaSel.addEventListener('change', function () {
        renderRondaVisualMap();
      });
    }

    document.querySelectorAll('.ronda-state-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.rondaStateTouched = true;
        setRondaStateUI(btn.getAttribute('data-ronda-state') || 'Conforme', false);
      });
    });

    const chkOrder = document.getElementById('ronda-create-order');
    if (chkOrder) {
      chkOrder.addEventListener('change', function () {
        state.rondaOrderTouched = true;
      });
    }

    const notesElLive = document.getElementById('ronda-notes');
    if (notesElLive) {
      notesElLive.addEventListener('input', maybeAutoDetectRondaState);
    }

    document.querySelectorAll('.ronda-check-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const val = btn.getAttribute('data-rcheck');
        const idx = state.rondaChecks.indexOf(val);
        if (idx === -1) state.rondaChecks.push(val);
        else state.rondaChecks.splice(idx, 1);
        syncRondaChecksUI();
        maybeAutoDetectRondaState();
      });
    });

    // Botón rápido "Todo OK (1 toque)"
    const btnQuickOk = document.getElementById('btn-ronda-quick-ok');
    if (btnQuickOk) {
      btnQuickOk.addEventListener('click', function () {
        const sel = document.getElementById('ronda-area-select');
        const area = sel ? sel.value : '';
        if (!area) return;
        const newItem = {
          id: 'R-' + Date.now(),
          espacio: area,
          estado: 'Conforme',
          checks: ['Funcionamiento normal / sin ruidos', 'Aseo y orden conforme'],
          notas: 'Espacio revisado conforme, sin observaciones.',
          crearOrden: false,
          fotos: [],
          fotoUrls: [],
          fotoFileIds: [],
          fechaCarpeta: getTodayIsoLocal(),
          backupStatus: 'none',
          hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        };
        state.rondaItems.push(newItem);
        state.rondaSavedToDrive = false;
        saveRondaDraft();
        resetRondaForm(true);
        renderRondaItemsList();
        showToast('✓ ' + area + ' marcado Todo OK');
      });
    }

    const btnCancelEdit = document.getElementById('btn-ronda-cancel-edit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', function () {
        resetRondaForm(false);
      });
    }

    // Dictado por voz nativo (Web Speech API)
    const btnVoice = document.getElementById('btn-ronda-voice');
    let activeRec = null;
    if (btnVoice) {
      btnVoice.addEventListener('click', function () {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          showToast('Tu navegador no soporta dictado directo; usa el micrófono del teclado.', true);
          return;
        }
        const lbl = document.getElementById('ronda-voice-label');
        if (activeRec) {
          activeRec.stop();
          activeRec = null;
          if (lbl) lbl.textContent = 'Dictar';
          return;
        }
        const rec = new SR();
        rec.lang = 'es-CL';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        activeRec = rec;
        if (lbl) lbl.textContent = 'Escuchando...';
        rec.onresult = function (ev) {
          const transcript = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
          const notes = document.getElementById('ronda-notes');
          if (notes && transcript) {
            notes.value = (notes.value ? notes.value.trim() + ' ' : '') + transcript.trim();
            maybeAutoDetectRondaState();
          }
        };
        rec.onerror = function () {
          showToast('No se pudo capturar el audio. Intenta nuevamente.', true);
        };
        rec.onend = function () {
          activeRec = null;
          if (lbl) lbl.textContent = 'Dictar';
        };
        rec.start();
      });
    }

    // Asistente IA para pulir redacción para el Comité
    const btnPolish = document.getElementById('btn-ronda-ai-polish');
    if (btnPolish) {
      btnPolish.addEventListener('click', async function () {
        if (!state.session) return;
        const notesEl = document.getElementById('ronda-notes');
        const areaEl = document.getElementById('ronda-area-select');
        const rawText = notesEl ? notesEl.value.trim() : '';
        if (!rawText && state.rondaChecks.length === 0) {
          showToast('Escribe, dicta o marca algún detalle primero.', true);
          return;
        }
        const origHtml = btnPolish.innerHTML;
        btnPolish.disabled = true;
        btnPolish.textContent = 'Mejorando...';
        const res = await postApi({
          action: 'polishReportAi',
          token: state.session.token,
          espacio: areaEl ? areaEl.value : '',
          estado: state.rondaState,
          checks: state.rondaChecks,
          texto: rawText,
        });
        btnPolish.disabled = false;
        btnPolish.innerHTML = origHtml;
        if (!res.ok) {
          showToast(res.error || 'No se pudo mejorar el texto', true);
          return;
        }
        if (notesEl && res.polished) {
          notesEl.value = res.polished;
          maybeAutoDetectRondaState();
          showToast('Redacción mejorada para el Comité');
        }
      });
    }

    const btnPhotos = document.getElementById('btn-ronda-photos');
    const photoInput = document.getElementById('ronda-photo-input');
    if (btnPhotos && photoInput) {
      btnPhotos.addEventListener('click', function () {
        photoInput.click();
      });
      photoInput.addEventListener('change', async function (e) {
        const files = Array.from(e.target.files || []);
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
          if (state.rondaPhotos.length >= 10) {
            showToast('Máximo 10 fotos por espacio en el informe');
            break;
          }
          try {
            const comp = await compressImage(files[i], 760, 0.7);
            state.rondaPhotos.push(comp.dataUrl);
          } catch (imgErr) {
            failed++;
          }
        }
        if (failed > 0) {
          showToast('No se pudieron leer ' + failed + ' foto(s). Intenta en formato JPG/PNG.', true);
        }
        renderRondaPhotosPreview();
        e.target.value = '';
      });
    }

    const form = document.getElementById('ronda-item-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const area = document.getElementById('ronda-area-select').value;
        const notes = document.getElementById('ronda-notes').value.trim();
        const prevEditing = (state.rondaEditingIdx >= 0 && state.rondaItems[state.rondaEditingIdx]) ? state.rondaItems[state.rondaEditingIdx] : null;
        const prevHasDrivePhotos = Boolean(prevEditing && prevEditing.fotoFileIds && prevEditing.fotoFileIds.length > 0);
        if (!notes && state.rondaChecks.length === 0 && state.rondaPhotos.length === 0 && !prevHasDrivePhotos) {
          showToast('Marca al menos una opción, escribe un comentario o sube una foto.', true);
          return;
        }
        maybeAutoDetectRondaState();
        const photosCopy = state.rondaPhotos.slice();
        const createOrderVal = Boolean(document.getElementById('ronda-create-order') && document.getElementById('ronda-create-order').checked);
        let savedItem = null;
        let needPhotoUpload = false;

        if (prevEditing) {
          const prev = prevEditing;
          const samePhotos = prev.fotos && prev.fotos.length === photosCopy.length && prev.fotos.every(function (p, i) { return p === photosCopy[i]; });
          const keepDriveOnly = prevHasDrivePhotos && photosCopy.length === 0;
          const preserveDrive = samePhotos || keepDriveOnly;
          savedItem = {
            id: prev.id,
            espacio: area,
            estado: state.rondaState,
            checks: state.rondaChecks.slice(),
            notas: notes,
            crearOrden: createOrderVal,
            fotos: photosCopy,
            fotoUrls: preserveDrive ? (prev.fotoUrls || []) : [],
            fotoFileIds: preserveDrive ? (prev.fotoFileIds || []) : [],
            fechaCarpeta: prev.fechaCarpeta || getTodayIsoLocal(),
            backupStatus: preserveDrive ? (prev.backupStatus || 'none') : (photosCopy.length > 0 ? 'pending' : 'none'),
            hora: prev.hora || new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
          };
          state.rondaItems[state.rondaEditingIdx] = savedItem;
          needPhotoUpload = !preserveDrive && photosCopy.length > 0;
        } else {
          savedItem = {
            id: 'R-' + Date.now(),
            espacio: area,
            estado: state.rondaState,
            checks: state.rondaChecks.slice(),
            notas: notes,
            crearOrden: createOrderVal,
            fotos: photosCopy,
            fotoUrls: [],
            fotoFileIds: [],
            fechaCarpeta: getTodayIsoLocal(),
            backupStatus: photosCopy.length > 0 ? 'pending' : 'none',
            hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
          };
          state.rondaItems.push(savedItem);
          needPhotoUpload = photosCopy.length > 0;
        }

        const wasEdit = state.rondaEditingIdx >= 0;
        state.rondaSavedToDrive = false;
        saveRondaDraft();
        resetRondaForm(!wasEdit);
        renderRondaItemsList();

        if (needPhotoUpload) {
          showToast(navigator.onLine ? (wasEdit ? 'Espacio actualizado · respaldando fotos...' : 'Espacio agregado · respaldando fotos en Drive...') : 'Guardado · fotos en cola offline');
          backupRondaItemPhotos(savedItem);
        } else {
          showToast(wasEdit ? 'Espacio actualizado en la ronda' : 'Espacio agregado al informe de ronda');
        }
      });
    }

    function clearRondaStateNow(skipConfirm) {
      if (!skipConfirm && state.rondaItems.length > 0) {
        const msg = state.rondaSavedToDrive
          ? '¿Limpiar la ronda actual para empezar una nueva?'
          : 'Aún no guardas el PDF de esta ronda en Drive. ¿Seguro que quieres borrar los ' + state.rondaItems.length + ' espacios registrados?';
        if (!window.confirm(msg)) return;
      }
      state.rondaItems = [];
      state.lastRondaPdf = null;
      state.rondaSavedToDrive = false;
      saveRondaDraft();
      resetRondaForm(false);
      renderRondaItemsList();
      const banner = document.getElementById('ronda-backup-banner');
      if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
      }
      showToast('Lista limpia para nueva ronda');
    }

    const btnClear = document.getElementById('btn-ronda-clear');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        clearRondaStateNow(false);
      });
    }

    const btnFinishNew = document.getElementById('btn-ronda-finish-new');
    if (btnFinishNew) {
      btnFinishNew.addEventListener('click', function () {
        clearRondaStateNow(true);
      });
    }

    const btnPrint = document.getElementById('btn-ronda-print-pdf');
    if (btnPrint) {
      btnPrint.addEventListener('click', printRondaPdf);
    }

    const btnDl = document.getElementById('btn-ronda-download-pdf');
    if (btnDl) {
      btnDl.addEventListener('click', downloadLastRondaPdf);
    }

    const btnShare = document.getElementById('btn-ronda-share-pdf');
    if (btnShare) {
      btnShare.addEventListener('click', shareLastRondaPdf);
    }
  }

  function renderRondaPhotosPreview() {
    const wrap = document.getElementById('ronda-photo-preview');
    const lbl = document.getElementById('ronda-photo-label');
    if (!wrap || !lbl) return;
    if (state.rondaPhotos.length === 0) {
      lbl.textContent = 'Adjuntar fotos de este espacio (hasta 10)';
      wrap.classList.add('hidden');
      wrap.classList.remove('flex');
      wrap.innerHTML = '';
      return;
    }
    lbl.textContent = state.rondaPhotos.length + (state.rondaPhotos.length === 1 ? ' foto lista' : ' fotos listas');
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
    wrap.innerHTML = state.rondaPhotos.map(function (src, idx) {
      return (
        '<div class="relative w-16 h-16 shrink-0">' +
          '<img src="' + src + '" alt="Foto ronda ' + (idx + 1) + '" class="w-16 h-16 object-cover rounded-sm border border-outline">' +
          '<button type="button" data-rm-ronda-photo="' + idx + '" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-secondary text-[12px] flex items-center justify-center shadow">×</button>' +
        '</div>'
      );
    }).join('');
    wrap.querySelectorAll('[data-rm-ronda-photo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.rondaPhotos.splice(Number(btn.getAttribute('data-rm-ronda-photo')), 1);
        renderRondaPhotosPreview();
      });
    });
  }

  function renderRondaItemsList() {
    const list = document.getElementById('ronda-items-list');
    const title = document.getElementById('ronda-list-title');
    const btnPrint = document.getElementById('btn-ronda-print-pdf');
    if (!list || !title) return;

    title.textContent = 'Espacios en esta ronda (' + state.rondaItems.length + ')';
    if (btnPrint) btnPrint.disabled = state.rondaItems.length === 0;
    updateRondaProgress();

    if (state.rondaItems.length === 0) {
      list.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">Aún no agregas espacios. Completa el formulario arriba o toca "Todo OK (1 toque)".</p>';
      return;
    }

    list.innerHTML = state.rondaItems.map(function (item, idx) {
      const badgeCls = item.estado === 'Acción urgente'
        ? 'bg-error-container text-on-error-container'
        : (item.estado === 'Con observación' ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container');
      const localCount = (item.fotos || []).length;
      const driveCount = (item.fotoFileIds || []).length;
      let backupPill = '';
      if (item.backupStatus === 'backed_up' && (driveCount > 0 || localCount > 0)) {
        backupPill = '<span class="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-[10px]">☁️ ' + (driveCount || localCount) + ' en Drive</span>';
      } else if (item.backupStatus === 'uploading') {
        backupPill = '<span class="px-gutter-sm py-0.5 rounded-full bg-primary-container text-on-primary-container font-label text-[10px]">☁️ Respaldando...</span>';
      } else if (item.backupStatus === 'pending' && localCount > 0) {
        backupPill = '<span class="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-[10px]">☁️ Pendiente</span>';
      }
      const orderPill = item.crearOrden
        ? '<span class="px-gutter-sm py-0.5 rounded-full bg-primary-container text-on-primary-container font-label text-[10px]">📋 Crea Orden</span>'
        : '';
      const thumbs = localCount > 0
        ? '<div class="flex flex-wrap gap-1 mt-1">' + item.fotos.map(function (f) {
            return '<img src="' + f + '" class="w-10 h-10 object-cover rounded-sm border border-outline">';
          }).join('') + '</div>'
        : (driveCount > 0
          ? '<span class="font-label text-[11px] text-on-surface-variant mt-1">' + driveCount + ' foto(s) ya respaldadas en Drive</span>'
          : '');
      return (
        '<article class="bg-surface-subtle rounded-lg border border-outline p-gutter-sm flex items-start justify-between gap-gutter-sm">' +
          '<div class="flex flex-col gap-0.5 min-w-0">' +
            '<div class="flex items-center gap-gutter-xs flex-wrap">' +
              '<span class="font-title text-title-sm text-on-surface">' + escapeHtml(item.espacio) + '</span>' +
              '<span class="px-gutter-sm py-0.5 rounded-full ' + badgeCls + ' font-label text-[11px]">' + escapeHtml(item.estado) + '</span>' +
              orderPill +
              backupPill +
            '</div>' +
            (item.checks && item.checks.length > 0 ? '<span class="font-label text-[11px] text-primary">✓ ' + escapeHtml(item.checks.join(' · ')) + '</span>' : '') +
            (item.notas ? '<p class="font-body text-body-sm text-on-surface-variant">' + escapeHtml(item.notas) + '</p>' : '') +
            thumbs +
          '</div>' +
          '<div class="flex items-center gap-0.5 shrink-0">' +
            '<button type="button" data-edit-ronda-item="' + idx + '" aria-label="Editar espacio" class="p-1 text-primary hover:bg-primary-container rounded-sm"><span class="material-symbols-outlined text-[18px]">edit</span></button>' +
            '<button type="button" data-rm-ronda-item="' + idx + '" aria-label="Quitar espacio" class="p-1 text-error hover:bg-error-container rounded-sm"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    list.querySelectorAll('[data-edit-ronda-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        startEditRondaItem(Number(btn.getAttribute('data-edit-ronda-item')));
      });
    });

    list.querySelectorAll('[data-rm-ronda-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const rmIdx = Number(btn.getAttribute('data-rm-ronda-item'));
        state.rondaItems.splice(rmIdx, 1);
        if (state.rondaEditingIdx === rmIdx) resetRondaForm(false);
        saveRondaDraft();
        populateRondaAreas(undefined, false);
        renderRondaItemsList();
      });
    });
  }

  function base64ToPdfBlob(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function downloadLastRondaPdf() {
    const pdf = state.lastRondaPdf;
    if (!pdf) return;
    if (pdf.pdfBase64) {
      try {
        const blob = base64ToPdfBlob(pdf.pdfBase64);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdf.fileName || 'Informe_Ronda.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        return;
      } catch (e) {}
    }
    const target = pdf.downloadUrl || pdf.linkPdf;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }

  async function shareLastRondaPdf() {
    const pdf = state.lastRondaPdf;
    if (!pdf) return;
    const title = 'Informe de Ronda — ' + (pdf.edifName || state.edificioId || 'Comunidad');
    if (pdf.pdfBase64 && navigator.share && typeof File !== 'undefined') {
      try {
        const blob = base64ToPdfBlob(pdf.pdfBase64);
        const file = new File([blob], pdf.fileName || 'Informe_Ronda.pdf', { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title,
            text: title + (pdf.linkPdf ? '\nRespaldo Drive: ' + pdf.linkPdf : ''),
            files: [file],
          });
          return;
        }
      } catch (shErr) {
        if (shErr && shErr.name === 'AbortError') return;
      }
    }
    if (navigator.share && pdf.linkPdf) {
      try {
        await navigator.share({ title: title, text: title, url: pdf.linkPdf });
        return;
      } catch (shErr2) {
        if (shErr2 && shErr2.name === 'AbortError') return;
      }
    }
    if (pdf.linkPdf) {
      const wa = 'https://wa.me/?text=' + encodeURIComponent(title + ': ' + pdf.linkPdf);
      window.open(wa, '_blank', 'noopener,noreferrer');
    }
  }

  async function printRondaPdf() {
    if (!state.rondaItems || state.rondaItems.length === 0) return;

    const btnPrint = document.getElementById('btn-ronda-print-pdf');
    const btnLbl = document.getElementById('ronda-pdf-btn-label');
    const origLbl = btnLbl ? btnLbl.textContent : 'Guardar y Generar Informe PDF';
    if (btnPrint) btnPrint.disabled = true;
    if (btnLbl) btnLbl.textContent = 'Guardando ronda y creando PDF...';

    const edifName = (state.data && state.data.edificio && state.data.edificio.nombre) ? state.data.edificio.nombre : (state.edificioId || 'Comunidad');
    const fechaCarpeta = (state.rondaItems[0] && state.rondaItems[0].fechaCarpeta) ? state.rondaItems[0].fechaCarpeta : getTodayIsoLocal();

    // 1. Subir a Drive cualquier foto pendiente antes de generar el PDF en Drive
    if (navigator.onLine && state.session && state.session.token) {
      for (let i = 0; i < state.rondaItems.length; i++) {
        const it = state.rondaItems[i];
        if (it && it.fotos && it.fotos.length > 0 && it.backupStatus !== 'backed_up') {
          await backupRondaItemPhotos(it);
        }
      }
    }

    // 2. Guardar la ronda en Sheets (Rondas + Documentos) y generar el archivo PDF real en Drive (sin diálogo de impresora)
    if (!state.session || !state.session.token || !state.edificioId) {
      if (btnPrint) btnPrint.disabled = false;
      if (btnLbl) btnLbl.textContent = origLbl;
      showToast('Inicia sesión y selecciona una comunidad para guardar el informe.', true);
      return;
    }

    try {
      const itemsPayload = state.rondaItems.map(function (it) {
        const hasIds = it.fotoFileIds && it.fotoFileIds.length > 0;
        return {
          espacio: it.espacio,
          estado: it.estado,
          checks: it.checks || [],
          notas: it.notas || '',
          crearOrden: Boolean(it.crearOrden),
          hora: it.hora || '',
          fotoFileIds: hasIds ? it.fotoFileIds : [],
          fotos: hasIds ? [] : (it.fotos || []),
        };
      });
      const backupRes = await postApi({
        action: 'saveRondaReport',
        token: state.session.token,
        edificioId: state.edificioId,
        edificioNombre: edifName,
        fechaCarpeta: fechaCarpeta,
        items: itemsPayload,
      });

      if (backupRes && backupRes.ok && backupRes.linkPdf) {
        state.rondaSavedToDrive = true;
        state.lastRondaPdf = {
          edifName: edifName,
          fileName: backupRes.fileName || 'Informe_Ronda.pdf',
          linkPdf: backupRes.linkPdf,
          downloadUrl: backupRes.downloadUrl || backupRes.linkPdf,
          folderUrl: backupRes.folderUrl || '',
          pdfBase64: backupRes.pdfBase64 || '',
        };
        const banner = document.getElementById('ronda-backup-banner');
        const bannerTitle = document.getElementById('ronda-backup-title');
        const pdfLink = document.getElementById('ronda-backup-pdf-link');
        const folderLink = document.getElementById('ronda-backup-folder-link');
        if (bannerTitle) {
          const parts = ['Ronda guardada en Drive'];
          if (backupRes.sectoresActualizados > 0) parts.push(backupRes.sectoresActualizados + ' sector(es) actualizado(s)');
          if (backupRes.ordenesCreadas > 0) parts.push(backupRes.ordenesCreadas + ' orden(es) creada(s)');
          bannerTitle.textContent = parts.join(' · ');
        }
        if (pdfLink) pdfLink.href = backupRes.linkPdf;
        if (folderLink && backupRes.folderUrl) folderLink.href = backupRes.folderUrl;
        if (banner) {
          banner.classList.remove('hidden');
          banner.classList.add('flex');
          banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast(backupRes.message || 'Ronda registrada y PDF guardado en Drive');
        try { loadData(); } catch (_) {}
      } else if (backupRes && backupRes.queued) {
        showToast('Sin señal: la ronda quedó en cola y se respaldará al reconectar.');
      } else {
        showToast((backupRes && backupRes.error) ? backupRes.error : 'No se pudo generar el PDF en Drive.', true);
      }
    } catch (bkErr) {
      showToast('Error al guardar el informe de ronda. Revisa tu conexión e intenta nuevamente.', true);
    }

    if (btnPrint) btnPrint.disabled = false;
    if (btnLbl) btnLbl.textContent = origLbl;
  }

  function openEditEquipmentModal(eq) {
    if (!state.session || !state.session.user || state.session.user.rol !== 'admin') return;
    const edifId = eq.edificioId || state.edificioId || '';
    const eqId = eq.equipoId || eq.id || '';
    if (!edifId || !eqId) return;

    document.getElementById('edit-eq-edificio').value = edifId;
    document.getElementById('edit-eq-id').value = eqId;
    document.getElementById('edit-eq-subtitle').textContent = '#' + eqId + ' · ' + edifId;
    document.getElementById('edit-eq-name').value = eq.nombre || '';
    document.getElementById('edit-eq-company').value = eq.empresa || '';
    document.getElementById('edit-eq-days').value = Number(eq.periodicidadDias || 30);
    document.getElementById('edit-eq-marca').value = eq.marca || '';
    document.getElementById('edit-eq-modelo').value = eq.modelo || '';
    document.getElementById('edit-eq-serie').value = eq.numeroSerie || '';
    openModal('modal-edit-equipment');
  }

  function openEditMaintenanceModal(m) {
    if (!state.session || !state.session.user || state.session.user.rol !== 'admin') return;
    if (!m || !m.id) return;

    document.getElementById('edit-maint-id').value = m.id;
    document.getElementById('edit-maint-subtitle').textContent = m.id + (state.data && state.data.equipo ? ' · ' + state.data.equipo.nombre : '');

    const rawDate = String(m.fecha || '').trim();
    const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    document.getElementById('edit-maint-date').value = dateMatch ? dateMatch[1] : getTodayIsoLocal();

    const typeSel = document.getElementById('edit-maint-type');
    if (typeSel) {
      const tipoVal = String(m.tipo || 'Preventiva').trim();
      const hasOpt = Array.from(typeSel.options).some(function (o) { return o.value === tipoVal; });
      if (!hasOpt) {
        const opt = document.createElement('option');
        opt.value = tipoVal;
        opt.textContent = tipoVal;
        typeSel.appendChild(opt);
      }
      typeSel.value = tipoVal;
    }

    const stateSel = document.getElementById('edit-maint-state');
    if (stateSel) {
      const est = String(m.estadoResultante || 'Operativo').trim();
      if (est.toLowerCase().indexOf('fuera') !== -1) stateSel.value = 'Fuera de Servicio';
      else if (est.toLowerCase().indexOf('observ') !== -1) stateSel.value = 'En Observacion';
      else stateSel.value = 'Operativo';
    }

    document.getElementById('edit-maint-cost').value = m.costoClp ? String(m.costoClp) : '';
    document.getElementById('edit-maint-tech').value = m.tecnico || '';
    document.getElementById('edit-maint-notes').value = m.observaciones || '';
    const fileInput = document.getElementById('edit-maint-file');
    if (fileInput) fileInput.value = '';
    const repChk = document.getElementById('edit-maint-replace-files');
    if (repChk) repChk.checked = false;

    openModal('modal-edit-maint');
  }

  function bindAdminEditModals() {
    const btnEditHero = document.getElementById('btn-edit-current-eq');
    if (btnEditHero) {
      btnEditHero.addEventListener('click', function () {
        if (!state.data || !state.data.equipo) return;
        openEditEquipmentModal({
          edificioId: (state.data.edificio && state.data.edificio.id) || state.edificioId,
          equipoId: state.data.equipo.id,
          nombre: state.data.equipo.nombre,
          empresa: state.data.equipo.empresa,
          periodicidadDias: state.data.equipo.periodicidadDias,
          marca: state.data.equipo.marca,
          modelo: state.data.equipo.modelo,
          numeroSerie: state.data.equipo.numeroSerie,
        });
      });
    }

    document.querySelectorAll('[data-eq-days-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const inp = document.getElementById('edit-eq-days');
        if (inp) inp.value = btn.getAttribute('data-eq-days-preset');
      });
    });

    const formEditEq = document.getElementById('form-edit-equipment');
    if (formEditEq) {
      formEditEq.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('btn-edit-eq-submit');
        setLoadingBtn(btn, true, 'Guardando...');
        const res = await postApi({
          action: 'updateEquipment',
          token: state.session.token,
          edificioId: document.getElementById('edit-eq-edificio').value.trim(),
          equipoId: document.getElementById('edit-eq-id').value.trim(),
          nombreEquipo: document.getElementById('edit-eq-name').value.trim(),
          empresa: document.getElementById('edit-eq-company').value.trim(),
          periodicidadDias: Number(document.getElementById('edit-eq-days').value || 30),
          marca: document.getElementById('edit-eq-marca').value.trim(),
          modelo: document.getElementById('edit-eq-modelo').value.trim(),
          numeroSerie: document.getElementById('edit-eq-serie').value.trim(),
        });
        setLoadingBtn(btn, false, 'Guardar cambios del equipo');
        if (!res.ok) {
          showToast(res.error || 'No se pudo actualizar el equipo', true);
          return;
        }
        closeModal('modal-edit-equipment');
        showToast(res.message || 'Equipo actualizado');
        loadData();
        const adminModal = document.getElementById('modal-admin');
        if (adminModal && !adminModal.classList.contains('hidden')) {
          loadAdminPanelData();
        }
      });
    }

    const formEditMaint = document.getElementById('form-edit-maint');
    if (formEditMaint) {
      formEditMaint.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('btn-edit-maint-submit');
        setLoadingBtn(btn, true, 'Guardando...');

        const archivos = [];
        const fileInput = document.getElementById('edit-maint-file');
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
        try {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.type && f.type.indexOf('image/') === 0) {
              const comp = await compressImage(f, 1280, 0.78);
              archivos.push({ base64: comp.dataUrl, mimeType: 'image/jpeg' });
            } else {
              const dataUrl = await readFileAsDataUrl(f);
              archivos.push({ base64: dataUrl, mimeType: f.type || 'application/pdf' });
            }
          }
        } catch (fErr) {
          setLoadingBtn(btn, false, 'Guardar cambios');
          showToast('Error al leer archivo adjunto', true);
          return;
        }

        const res = await postApi({
          action: 'updateMaintenance',
          token: state.session.token,
          maintId: document.getElementById('edit-maint-id').value.trim(),
          fecha: document.getElementById('edit-maint-date').value.trim(),
          tipo: document.getElementById('edit-maint-type').value,
          estadoResultante: document.getElementById('edit-maint-state').value,
          tecnico: document.getElementById('edit-maint-tech').value.trim(),
          observaciones: document.getElementById('edit-maint-notes').value.trim(),
          costoClp: Number(document.getElementById('edit-maint-cost').value || 0),
          archivos: archivos,
          reemplazarAdjuntos: Boolean(document.getElementById('edit-maint-replace-files') && document.getElementById('edit-maint-replace-files').checked),
        });
        setLoadingBtn(btn, false, 'Guardar cambios');
        if (!res.ok) {
          showToast(res.error || 'No se pudo actualizar la mantención', true);
          return;
        }
        closeModal('modal-edit-maint');
        showToast(res.message || 'Mantención actualizada');
        loadData();
      });
    }

    const btnDelMaint = document.getElementById('btn-delete-maint');
    if (btnDelMaint) {
      btnDelMaint.addEventListener('click', async function () {
        const maintId = document.getElementById('edit-maint-id').value.trim();
        if (!maintId) return;
        if (!window.confirm('¿Eliminar permanentemente el registro ' + maintId + '? Esta acción recalculará el semáforo del equipo.')) {
          return;
        }
        setLoadingBtn(btnDelMaint, true, 'Eliminando...');
        const res = await postApi({
          action: 'deleteMaintenance',
          token: state.session.token,
          maintId: maintId,
        });
        setLoadingBtn(btnDelMaint, false, 'Eliminar esta mantención');
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar', true);
          return;
        }
        closeModal('modal-edit-maint');
        showToast(res.message || 'Mantención eliminada');
        loadData();
      });
    }
  }
})();
