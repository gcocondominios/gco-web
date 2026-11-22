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
    });
    window.addEventListener('offline', updateOfflineBanner);

    if (navigator.onLine) {
      syncOfflineQueue();
    }
  });

  function readUrlAndLoad() {
    const params = new URLSearchParams(window.location.search);
    state.edificioId = (params.get('edificio') || '').trim();
    state.equipoId = (params.get('equipo') || '').trim();

    if (!state.edificioId) {
      showErrorState('Falta el parámetro ?edificio= en la URL. Escanea el código QR del equipo.');
      return;
    }

    loadData();
  }

  async function loadData() {
    showView('loading');
    const url = new URL(API_URL);
    url.searchParams.set('edificio', state.edificioId);
    if (state.equipoId) {
      url.searchParams.set('equipo', state.equipoId);
    }

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        showErrorState(json.error || 'No se pudo cargar la información.');
        return;
      }

      state.data = json;
      if (json.mode === 'equipo') {
        renderEquipoView(json);
      } else {
        renderDirectoryView(json);
      }
    } catch (err) {
      showErrorState('Error de conexión con el servidor. Verifica tu internet e intenta nuevamente.');
    }
  }

  function showView(name) {
    const views = ['loading', 'error', 'equipment', 'directory'];
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
      const canSeeDir = Boolean(state.session && state.session.user && (state.session.user.rol === 'tecnico' || state.session.user.rol === 'admin' || state.session.user.rol === 'comite'));
      const showBack = name === 'equipment' && canSeeDir;
      btnBack.classList.toggle('hidden', !showBack);
      btnBack.classList.toggle('inline-flex', showBack);
    }
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
    const canSee = Boolean(user && (user.rol === 'tecnico' || user.rol === 'admin'));
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
            '</div>' +
          '</div>' +
        '</details>'
      );
    }).join('');

    container.querySelectorAll('[data-receipt-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = items[Number(btn.getAttribute('data-receipt-idx'))];
        if (m) printMaintenanceReceipt(m);
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

    const list = document.getElementById('directory-list');
    list.innerHTML = data.equipos.map(function (eq) {
      const sem = eq.semaforo;
      const isOk = sem.color === 'verde';
      const dataState = isOk ? 'ok' : 'alert';
      const borderLeft = sem.color === 'rojo' ? 'border-l-4 border-l-error' : (sem.color === 'amarillo' ? 'border-l-4 border-l-warning' : '');
      const iconBg = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo' ? 'bg-warning-container text-on-warning-container' : 'bg-primary-container text-on-primary-container');
      const badgeClass = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo' ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container');

      return (
        '<button type="button" data-equipo-id="' + escapeHtml(eq.id) + '" data-state="' + dataState + '" class="dir-asset-item text-left w-full bg-surface-card text-on-surface-card rounded-lg border border-outline-subtle ' + borderLeft + ' p-gutter-lg shadow-gco flex items-center justify-between gap-gutter-md hover:bg-surface-subtle transition-colors duration-state-change">' +
          '<div class="flex items-center gap-gutter-md min-w-0">' +
            '<div class="w-10 h-10 rounded-md ' + iconBg + ' flex items-center justify-center shrink-0" aria-hidden="true">' +
              '<span class="material-symbols-outlined text-[20px]">' + guessEquipmentIcon(eq.nombre, eq.id) + '</span>' +
            '</div>' +
            '<div class="flex flex-col gap-gutter-xs min-w-0">' +
              '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
              '<span class="font-label text-label-sm text-on-surface-variant tabular-nums">#' + escapeHtml(eq.id) + ' · ' + escapeHtml(formatShortDate(sem.ultimaVisita)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-gutter-xs shrink-0">' +
            '<span class="inline-flex items-center px-gutter-sm py-gutter-xs rounded-full ' + badgeClass + ' font-label text-label-sm">' + escapeHtml(sem.etiquetaCorta) + '</span>' +
            '<span class="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">chevron_right</span>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    list.querySelectorAll('.dir-asset-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const eqId = btn.getAttribute('data-equipo-id');
        navigateToEquipo(eqId);
      });
    });

    updateSessionUI();
    showView('directory');
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

    if (!user) {
      roleBar.classList.add('hidden');
      roleBar.classList.remove('flex');
      btnMaint.classList.add('hidden');
      btnMaint.classList.remove('inline-flex');
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

    const canMaint = Boolean(user.rol === 'tecnico' || user.rol === 'admin');
    const isAdmin = user.rol === 'admin';
    const isCommittee = user.rol === 'comite' || user.rol === 'admin';

    if (canMaint || isAdmin || isCommittee) {
      roleBar.classList.remove('hidden');
      roleBar.classList.add('flex');
    } else {
      roleBar.classList.add('hidden');
      roleBar.classList.remove('flex');
    }

    btnMaint.classList.toggle('hidden', !canMaint);
    btnMaint.classList.toggle('inline-flex', canMaint);
    btnAdmin.classList.toggle('hidden', !isAdmin);
    btnAdmin.classList.toggle('inline-flex', isAdmin);
    if (btnCommittee) {
      btnCommittee.classList.toggle('hidden', !isCommittee);
      btnCommittee.classList.toggle('inline-flex', isCommittee);
    }

    const unitInput = document.getElementById('resident-unit');
    if (unitInput && !unitInput.value && user.deptoOEmpresa) {
      unitInput.value = user.deptoOEmpresa;
    }
  }

  function bindEvents() {
    document.getElementById('btn-retry-load').addEventListener('click', loadData);

    document.getElementById('btn-back-directory').addEventListener('click', function () {
      navigateToEquipo('');
    });

    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });

    ['modal-report', 'modal-auth', 'modal-maintenance', 'modal-admin', 'modal-qr', 'modal-committee', 'modal-ai'].forEach(function (id) {
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

    document.querySelectorAll('.dir-filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const filter = chip.getAttribute('data-filter');
        document.querySelectorAll('.dir-filter-chip').forEach(function (c) {
          c.className = 'dir-filter-chip px-gutter-md py-gutter-xs rounded-full bg-surface-card border border-outline text-on-surface-variant font-label text-label-md hover:bg-surface-subtle transition-colors duration-state-change';
        });
        chip.className = 'dir-filter-chip px-gutter-md py-gutter-xs rounded-full bg-primary text-on-primary font-label text-label-md transition-colors duration-state-change';

        document.querySelectorAll('.dir-asset-item').forEach(function (item) {
          const st = item.getAttribute('data-state');
          const show = filter === 'all' || filter === st;
          item.classList.toggle('hidden', !show);
          item.classList.toggle('flex', show);
        });
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
      saveSession(null);
      showToast('Sesión cerrada');
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

    document.getElementById('btn-open-maintenance').addEventListener('click', function () {
      const dateInput = document.getElementById('maint-date');
      if (dateInput && !dateInput.value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        dateInput.value = yyyy + '-' + mm + '-' + dd;
      }

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
      for (let i = 0; i < files.length; i++) {
        if (state.maintFiles.length >= 6) {
          showToast('Máximo 6 archivos por mantención', true);
          break;
        }
        const file = files[i];
        if (file.type.startsWith('image/')) {
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
      if (!nuevoEdif || nuevoEdif === state.edificioId) return;
      state.edificioId = nuevoEdif;
      state.equipoId = '';
      const url = new URL(window.location.href);
      url.searchParams.set('edificio', nuevoEdif);
      url.searchParams.delete('equipo');
      window.history.pushState({}, '', url.toString());
      loadData();
      loadAdminPanelData();
    });

    document.querySelectorAll('.admin-panel-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const target = tab.getAttribute('data-admin-tab');
        document.querySelectorAll('.admin-panel-tab').forEach(function (t) {
          t.className = t === tab
            ? 'admin-panel-tab py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-[11px] md:text-label-sm'
            : 'admin-panel-tab py-gutter-sm rounded-sm text-on-surface-variant font-label text-[11px] md:text-label-sm';
        });
        ['tickets', 'ordenes', 'cotizaciones', 'equipos', 'bodega', 'usuarios'].forEach(function (name) {
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
    const url = new URL(API_URL);
    url.searchParams.set('action', 'adminData');
    url.searchParams.set('token', state.session.token);
    url.searchParams.set('edificio', state.edificioId);

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        showToast(json.error || 'Error al cargar panel', true);
        return;
      }

      const selWrap = document.getElementById('admin-building-selector-wrap');
      const sel = document.getElementById('admin-building-select');
      if (json.isGlobalAdmin && json.edificios && json.edificios.length > 0) {
        selWrap.classList.remove('hidden');
        selWrap.classList.add('flex');
        sel.innerHTML = json.edificios.map(function (ed) {
          const selected = ed.id === state.edificioId ? ' selected' : '';
          return '<option value="' + escapeHtml(ed.id) + '"' + selected + '>' + escapeHtml(ed.nombre) + ' (' + escapeHtml(ed.id) + ')</option>';
        }).join('');
      } else {
        selWrap.classList.add('hidden');
        selWrap.classList.remove('flex');
      }

      renderAdminTickets(json.tickets || []);
      renderAdminOrdenes(json.ordenes || [], json.equipos || []);
      renderAdminCotizaciones(json.cotizaciones || [], json.equipos || []);
      renderAdminEquipos(json.equipos || []);
      renderAdminBodega(json.inventario || []);
      renderAdminUsers(json.usuarios || []);
    } catch (err) {
      showToast('Error de red al cargar panel', true);
    }
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

      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm" data-ticket-id="' + escapeHtml(t.id) + '">' +
          '<div class="flex items-start justify-between gap-gutter-sm">' +
            '<span class="font-mono text-mono-sm text-on-surface-variant">' + escapeHtml(t.id) + ' · #' + escapeHtml(t.equipoId) + ' · ' + escapeHtml(t.depto) + '</span>' +
            '<span class="px-gutter-sm py-gutter-xs rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">' + escapeHtml(t.estado) + '</span>' +
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
        for (let i = 0; i < files.length; i++) {
          if (fotosDespues.length >= 5) break;
          const compressed = await compressImage(files[i], 1024, 0.75);
          fotosDespues.push(compressed.dataUrl);
        }
        renderTicketThumbs();
        e.target.value = '';
      });

      card.querySelectorAll('.btn-admin-ticket-save').forEach(function (btn) {
        btn.addEventListener('click', async function () {
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

    const agendaStrip = equipos.length > 0
      ? '<div class="grid grid-cols-3 gap-gutter-xs">' +
          '<div class="bg-error-container text-on-error-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + vencidas + '</div><div class="font-label text-[11px]">Vencidas/Alerta</div></div>' +
          '<div class="bg-warning-container text-on-warning-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + porVencer + '</div><div class="font-label text-[11px]">Por vencer</div></div>' +
          '<div class="bg-success-container text-on-success-container rounded-md p-gutter-sm text-center"><div class="font-headline text-title-md">' + alDia + '</div><div class="font-label text-[11px]">Al día</div></div>' +
        '</div>'
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
        : (sem.color === 'amarillo' ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container');
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
          '</div>' +
        '</article>'
      );
    }).join('');

    container.innerHTML = addBoxHtml + agendaStrip + printTopBtn + cardsHtml;

    const addForm = document.getElementById('admin-add-eq-form');
    if (addForm) {
      addForm.addEventListener('submit', async function (e) {
        e.preventDefault();
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

  function openQrModal(eq, qrUrl) {
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

    new QRCode(box, {
      text: qrUrl,
      width: 220,
      height: 220,
      colorDark: '#0F2942',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M,
    });

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

    openModal('modal-qr');
  }

  function printQrCards(equipos) {
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
    equipos.forEach(function (eq, idx) {
      const qrUrl = base + '?edificio=' + encodeURIComponent(eq.edificioId) + '&equipo=' + encodeURIComponent(eq.equipoId);
      const card = document.createElement('div');
      card.style.cssText = 'border: 1px solid #DEE3ED; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; background: #FFFFFF;';
      card.innerHTML =
        '<div style="font-size: 15px; font-weight: 700; color: #0F2942; margin-bottom: 4px;">' + escapeHtml(eq.nombre) + '</div>' +
        '<div style="font-family: \'Red Hat Mono\', monospace; font-size: 12px; color: #49607C; margin-bottom: 12px;">Equipo #' + escapeHtml(eq.equipoId) + '</div>' +
        '<div id="print-qr-box-' + idx + '" style="display: inline-block; padding: 8px; background: #FFFFFF;"></div>' +
        '<div style="font-size: 11px; color: #49607C; margin-top: 10px;">Escanea para ver estado, PDF o reportar fallas</div>';
      grid.appendChild(card);

      new QRCode(document.getElementById('print-qr-box-' + idx), {
        text: qrUrl,
        width: 150,
        height: 150,
        colorDark: '#0F2942',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M,
      });
    });

    const committeeSheet = document.getElementById('print-committee-sheet');
    if (committeeSheet) committeeSheet.classList.remove('print-active');
    sheet.classList.add('print-active');

    setTimeout(function () {
      window.print();
    }, 250);
  }

  async function loadCommitteeData() {
    if (!state.session) return;
    const url = new URL(API_URL);
    url.searchParams.set('action', 'committeeData');
    url.searchParams.set('token', state.session.token);
    url.searchParams.set('edificio', state.edificioId);

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) {
        showToast(json.error || 'No se pudo cargar el resumen de comité', true);
        return;
      }
      renderCommitteeModal(json);
    } catch (err) {
      showToast('Error de red al cargar portal comité', true);
    }
  }

  function renderCommitteeModal(data) {
    document.getElementById('committee-building-subtitle').textContent = data.edificio.nombre + ' · Actualizado ' + formatShortDate(data.generadoEn);

    const r = data.resumen;
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

    document.getElementById('committee-equipment-list').innerHTML = data.equipos.map(function (eq) {
      const sem = eq.semaforo;
      const badgeClass = sem.color === 'rojo'
        ? 'bg-error-container text-on-error-container'
        : (sem.color === 'amarillo' ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container');
      const pdfLink = splitLinks(eq.ultimoPdf)[0] || '';
      const pdfHtml = pdfLink
        ? '<a href="' + escapeHtml(pdfLink) + '" target="_blank" rel="noopener noreferrer" class="font-label text-label-sm text-primary hover:underline">Ver PDF</a>'
        : '<span class="font-label text-label-sm text-on-surface-variant">Sin PDF</span>';

      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-xs">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
            '<span class="px-gutter-sm py-gutter-xs rounded-full ' + badgeClass + ' font-label text-label-sm shrink-0">' + escapeHtml(sem.etiquetaCorta) + '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between text-on-surface-variant font-label text-label-sm">' +
            '<span>#' + escapeHtml(eq.id) + ' · ' + escapeHtml(eq.empresa) + '</span>' +
            pdfHtml +
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

  function bindQuoteStatusButtons(container, onSuccess) {
    if (!container) return;
    container.querySelectorAll('.btn-quote-status').forEach(function (btn) {
      btn.addEventListener('click', async function () {
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
      });
    });

    container.querySelectorAll('.btn-quote-to-order').forEach(function (btn) {
      btn.addEventListener('click', async function () {
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
                '<button type="button" data-inv-id="' + escapeHtml(item.id) + '" data-inv-delta="-1" class="btn-inv-adj w-9 h-9 rounded-md bg-surface-card border border-outline font-title text-title-md text-on-surface">-</button>' +
                '<span class="px-gutter-sm py-1 rounded-md ' + badgeCls + ' font-mono text-mono-sm min-w-[56px] text-center">' + item.stockActual + ' ' + escapeHtml(item.unidad) + '</span>' +
                '<button type="button" data-inv-id="' + escapeHtml(item.id) + '" data-inv-delta="1" class="btn-inv-adj w-9 h-9 rounded-md bg-surface-card border border-outline font-title text-title-md text-on-surface">+</button>' +
              '</div>' +
            '</article>'
          );
        }).join('');

    container.innerHTML = formHtml + listHtml;

    const form = document.getElementById('admin-add-inv-form');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
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
        const res = await postApi({
          action: 'saveInventoryItem',
          token: state.session.token,
          edificioId: state.edificioId,
          itemId: btn.getAttribute('data-inv-id'),
          delta: Number(btn.getAttribute('data-inv-delta')),
        });
        if (!res.ok) {
          showToast(res.error || 'Error al ajustar stock', true);
          return;
        }
        showToast(res.message);
        loadAdminPanelData();
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
        if (f.type.startsWith('image/')) {
          const comp = await compressImage(f, 1280, 0.8);
          quoteFileBase64 = comp.dataUrl;
          quoteFileMime = 'image/jpeg';
        } else {
          quoteFileBase64 = await readFileAsDataUrl(f);
          quoteFileMime = f.type || 'application/pdf';
        }
        fileBtn.textContent = f.name;
      });
    }

    const form = document.getElementById('admin-add-quote-form');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
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

  function printMaintenanceReceipt(m) {
    const qrSheet = document.getElementById('print-qr-sheet');
    const commSheet = document.getElementById('print-committee-sheet');
    if (qrSheet) qrSheet.classList.remove('print-active');
    if (commSheet) commSheet.classList.remove('print-active');

    const sheet = document.getElementById('print-receipt-sheet');
    if (!sheet || !state.data) return;
    sheet.classList.add('print-active');

    const eq = state.data.equipo;
    const edif = state.data.edificio;
    const qrUrl = window.location.origin + window.location.pathname + '?edificio=' + encodeURIComponent(edif.id) + '&equipo=' + encodeURIComponent(eq.id);

    sheet.innerHTML =
      '<div style="font-family: \'Plus Jakarta Sans\', \'Rubik\', sans-serif; color: #0F2942; max-width: 720px; margin: 0 auto; border: 1px solid #DEE3ED; border-radius: 12px; padding: 24px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #1D5B96; padding-bottom: 12px; margin-bottom: 16px;">' +
          '<div>' +
            '<h1 style="font-size: 19px; font-weight: 700; margin: 0;">Comprobante de Visita / Mantención</h1>' +
            '<p style="font-size: 13px; color: #49607C; margin: 4px 0 0 0;">' + escapeHtml(edif.nombre) + ' · ' + escapeHtml(eq.nombre) + ' (#' + escapeHtml(eq.id) + ')</p>' +
          '</div>' +
          '<div id="receipt-qr-box" style="padding: 4px; background: #fff;"></div>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; margin-bottom: 16px;">' +
          '<div><strong>Folio:</strong> ' + escapeHtml(m.id) + '</div>' +
          '<div><strong>Fecha:</strong> ' + escapeHtml(formatShortDate(m.fecha)) + '</div>' +
          '<div><strong>Tipo:</strong> ' + escapeHtml(m.tipo) + '</div>' +
          '<div><strong>Estado resultante:</strong> ' + escapeHtml(m.estadoResultante) + '</div>' +
          '<div><strong>Responsable:</strong> ' + escapeHtml(m.tecnico || eq.empresa) + '</div>' +
          (m.costoClp > 0 ? '<div><strong>Costo:</strong> $' + Number(m.costoClp).toLocaleString('es-CL') + ' CLP</div>' : '') +
        '</div>' +
        '<div style="background: #F4F6F9; border-radius: 8px; padding: 14px; font-size: 13px; margin-bottom: 24px;">' +
          '<strong>Observaciones / Verificación:</strong><br>' + escapeHtml(m.observaciones) +
        '</div>' +
        '<div style="font-size: 11px; color: #49607C; text-align: center; border-top: 1px solid #E8ECF2; padding-top: 10px;">' +
          'GCO Gestión de Condominios · Escanea el código QR superior para verificar en línea (' + escapeHtml(qrUrl) + ')' +
        '</div>' +
      '</div>';

    if (typeof QRCode !== 'undefined') {
      new QRCode(document.getElementById('receipt-qr-box'), {
        text: qrUrl,
        width: 84,
        height: 84,
        colorDark: '#0F2942',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M,
      });
    }

    setTimeout(function () {
      window.print();
    }, 200);
  }

  function printCommitteeReport(data) {
    const qrSheet = document.getElementById('print-qr-sheet');
    if (qrSheet) qrSheet.classList.remove('print-active');
    const sheet = document.getElementById('print-committee-sheet');
    sheet.classList.add('print-active');

    const userName = state.session && state.session.user ? state.session.user.nombre : 'Comité de Administración';
    const r = data.resumen;

    const eqRows = data.equipos.map(function (eq) {
      const sem = eq.semaforo;
      return (
        '<tr>' +
          '<td style="border:1px solid #DEE3ED; padding:8px;"><strong>' + escapeHtml(eq.nombre) + '</strong><br><span style="font-size:11px; color:#49607C;">#' + escapeHtml(eq.id) + '</span></td>' +
          '<td style="border:1px solid #DEE3ED; padding:8px;">' + escapeHtml(eq.empresa) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:8px;">' + escapeHtml(formatShortDate(sem.ultimaVisita)) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:8px;">' + escapeHtml(formatShortDate(sem.proximaVisita)) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:8px;"><strong>' + escapeHtml(sem.etiquetaCorta) + '</strong></td>' +
          '<td style="border:1px solid #DEE3ED; padding:8px; font-size:12px;">' + escapeHtml(eq.ultimaObservacion) + '</td>' +
        '</tr>'
      );
    }).join('');

    const ticketRows = (data.tickets || []).slice(0, 15).map(function (t) {
      return (
        '<tr>' +
          '<td style="border:1px solid #DEE3ED; padding:6px; font-size:12px;">' + escapeHtml(t.id) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:6px; font-size:12px;">' + escapeHtml(formatShortDate(t.fecha)) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:6px; font-size:12px;">#' + escapeHtml(t.equipoId) + ' (' + escapeHtml(t.depto) + ')</td>' +
          '<td style="border:1px solid #DEE3ED; padding:6px; font-size:12px;">' + escapeHtml(t.estado) + '</td>' +
          '<td style="border:1px solid #DEE3ED; padding:6px; font-size:12px;">' + escapeHtml(t.descripcion) + (t.solucion ? '<br><em>Solución: ' + escapeHtml(t.solucion) + '</em>' : '') + '</td>' +
        '</tr>'
      );
    }).join('');

    const costSummaryHtml = r.costoTotalGeneral > 0
      ? '<div style="border:1px solid #DEE3ED; border-radius:8px; padding:10px; margin-bottom:18px; font-size:12px; background:#F9FAFC;">' +
          '<strong>Inversión registrada en mantenciones:</strong> ' +
          'Total $' + Number(r.costoTotalGeneral).toLocaleString('es-CL') + ' CLP ' +
          '(Preventivas: $' + Number(r.costoTotalPreventivo || 0).toLocaleString('es-CL') +
          ' · Correctivas/Otros: $' + Number(r.costoTotalCorrectivo || 0).toLocaleString('es-CL') + ')' +
        '</div>'
      : '';

    sheet.innerHTML =
      '<div style="font-family: \'Plus Jakarta Sans\', \'Rubik\', sans-serif; color: #0F2942; max-width: 900px; margin: 0 auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 2px solid #1D5B96; padding-bottom: 12px; margin-bottom: 16px;">' +
          '<div>' +
            '<h1 style="font-size: 20px; font-weight: 700; margin: 0;">Acta de Revisión de Equipos y Mantenciones</h1>' +
            '<p style="font-size: 13px; color: #49607C; margin: 4px 0 0 0;">Comunidad: <strong>' + escapeHtml(data.edificio.nombre) + '</strong> (' + escapeHtml(data.edificio.id) + ')</p>' +
          '</div>' +
          '<div style="text-align:right; font-size: 12px; color: #49607C;">' +
            '<div>GCO Gestión de Condominios</div>' +
            '<div>Fecha: ' + escapeHtml(data.generadoEn) + '</div>' +
            '<div>Emitido por: ' + escapeHtml(userName) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;">' +
          '<div style="border:1px solid #DEE3ED; border-radius:8px; padding:10px;"><div style="font-size:11px; color:#49607C;">Operativos</div><div style="font-size:18px; font-weight:700; color:#005236;">' + r.operativos + ' / ' + r.totalEquipos + '</div></div>' +
          '<div style="border:1px solid #DEE3ED; border-radius:8px; padding:10px;"><div style="font-size:11px; color:#49607C;">En Observación</div><div style="font-size:18px; font-weight:700; color:#653E00;">' + r.observacion + '</div></div>' +
          '<div style="border:1px solid #DEE3ED; border-radius:8px; padding:10px;"><div style="font-size:11px; color:#49607C;">Fuera de Servicio</div><div style="font-size:18px; font-weight:700; color:#930013;">' + r.fueraServicio + '</div></div>' +
          '<div style="border:1px solid #DEE3ED; border-radius:8px; padding:10px;"><div style="font-size:11px; color:#49607C;">Tickets Activos / Resueltos</div><div style="font-size:18px; font-weight:700;">' + (r.ticketsAbiertos + r.ticketsEnProceso) + ' / ' + r.ticketsResueltos + '</div></div>' +
        '</div>' +
        costSummaryHtml +
        '<h2 style="font-size: 15px; font-weight: 700; margin: 16px 0 8px 0;">1. Estado de Equipos e Instalaciones</h2>' +
        '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">' +
          '<thead><tr style="background:#F4F6F9; text-align:left;"><th style="border:1px solid #DEE3ED; padding:8px;">Equipo</th><th style="border:1px solid #DEE3ED; padding:8px;">Empresa</th><th style="border:1px solid #DEE3ED; padding:8px;">Última Visita</th><th style="border:1px solid #DEE3ED; padding:8px;">Próx. Visita</th><th style="border:1px solid #DEE3ED; padding:8px;">Estado</th><th style="border:1px solid #DEE3ED; padding:8px;">Última Observación</th></tr></thead>' +
          '<tbody>' + eqRows + '</tbody>' +
        '</table>' +
        '<h2 style="font-size: 15px; font-weight: 700; margin: 16px 0 8px 0;">2. Registro Reciente de Incidencias (Tickets)</h2>' +
        '<table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:28px;">' +
          '<thead><tr style="background:#F4F6F9; text-align:left;"><th style="border:1px solid #DEE3ED; padding:6px;">ID</th><th style="border:1px solid #DEE3ED; padding:6px;">Fecha</th><th style="border:1px solid #DEE3ED; padding:6px;">Equipo / Depto</th><th style="border:1px solid #DEE3ED; padding:6px;">Estado</th><th style="border:1px solid #DEE3ED; padding:6px;">Detalle y Solución</th></tr></thead>' +
          '<tbody>' + (ticketRows || '<tr><td colspan="5" style="border:1px solid #DEE3ED; padding:8px;">Sin tickets registrados.</td></tr>') + '</tbody>' +
        '</table>' +
        '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; page-break-inside: avoid;">' +
          '<div style="border-top: 1px solid #0F2942; padding-top: 8px; font-size: 12px; text-align: center;">Toma de Conocimiento · Comité de Administración</div>' +
          '<div style="border-top: 1px solid #0F2942; padding-top: 8px; font-size: 12px; text-align: center;">GCO Gestión de Condominios · Respaldo Ley 21.442</div>' +
        '</div>' +
      '</div>';

    setTimeout(function () {
      window.print();
    }, 200);
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
              '<option value="tecnico">Técnico</option>' +
              '<option value="admin">Admin edificio</option>' +
              '<option value="vecino">Vecino</option>' +
            '</select>' +
            '<input id="new-usr-extra" type="text" placeholder="Cargo / Empresa / Depto" class="w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-sm py-gutter-xs">' +
          '</div>' +
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
      navigator.serviceWorker.register('./sw.js').catch(function () {});
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

  async function syncOfflineQueue() {
    const queue = loadOfflineQueue();
    if (queue.length === 0 || !navigator.onLine) return;

    const remaining = [];
    let syncedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(queue[i]),
        });
        const json = await res.json();
        if (json && json.ok) syncedCount++;
        else remaining.push(queue[i]);
      } catch (err) {
        remaining.push(queue[i]);
      }
    }

    saveOfflineQueue(remaining);
    if (syncedCount > 0) {
      showToast('Se sincronizaron ' + syncedCount + ' registro(s) pendientes');
      loadData();
    }
  }

  async function postApi(payload) {
    const queueable = ['createTicket', 'addMaintenance', 'updateTicket'].indexOf(payload.action) !== -1;

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
    const d = new Date(String(str).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(str);
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return String(d.getDate()).padStart(2, '0') + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
  }

  function guessEquipmentIcon(nombre, id) {
    const t = (String(nombre) + ' ' + String(id)).toLowerCase();
    if (t.includes('ascensor') || t.includes('asc')) return 'elevator';
    if (t.includes('bomba') || t.includes('agua') || t.includes('bmb')) return 'water_pump';
    if (t.includes('port') || t.includes('acceso') || t.includes('prt')) return 'garage';
    if (t.includes('generador') || t.includes('electr') || t.includes('gen')) return 'bolt';
    if (t.includes('gas') || t.includes('sello')) return 'propane_tank';
    if (t.includes('extintor') || t.includes('incendio') || t.includes('red')) return 'local_fire_department';
    if (t.includes('cert')) return 'verified';
    if (t.includes('jard') || t.includes('riego')) return 'yard';
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
})();
