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

  const state = {
    edificioId: '',
    equipoId: '',
    data: null,
    session: loadSession(),
    reportCategory: 'Ruido inusual',
    reportPhotoBase64: '',
    quickAuthMode: 'login',
    authMode: 'login',
    maintType: 'Preventiva',
    maintState: 'Operativo',
    maintFileBase64: '',
    maintFileMime: '',
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    updateSessionUI();
    readUrlAndLoad();

    window.addEventListener('popstate', function () {
      readUrlAndLoad();
    });
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
      const canSeeDir = Boolean(state.session && state.session.user && (state.session.user.rol === 'tecnico' || state.session.user.rol === 'admin'));
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
    if (data.ultimoPdf) {
      btnPdf.disabled = false;
      btnPdfLabel.textContent = 'Ver Último Informe Técnico (PDF)';
      btnPdf.onclick = function () {
        window.open(data.ultimoPdf, '_blank', 'noopener,noreferrer');
      };
    } else {
      btnPdf.disabled = true;
      btnPdfLabel.textContent = 'Sin informe PDF adjunto aún';
      btnPdf.onclick = null;
    }

    renderHistory(data.historial || []);
    renderActiveTickets(data.ticketsActivos || []);

    updateSessionUI();
    showView('equipment');
  }

  function renderHistory(items) {
    const container = document.getElementById('history-list');
    const countLabel = document.getElementById('history-count-label');
    countLabel.textContent = items.length === 1 ? 'Último registro' : 'Últimos ' + items.length + ' registros';

    if (items.length === 0) {
      container.innerHTML = '<div class="px-gutter-lg py-gutter-md text-body-sm text-on-surface-variant">Aún no hay mantenciones registradas para este equipo.</div>';
      return;
    }

    container.innerHTML = items.map(function (m) {
      const isCorr = m.tipo.toLowerCase() !== 'preventiva';
      const iconBg = isCorr ? 'bg-warning-container text-on-warning-container' : 'bg-primary-container text-on-primary-container';
      const iconName = isCorr ? 'handyman' : 'build_circle';
      const pdfLinkHtml = m.linkPdf
        ? '<a href="' + escapeHtml(m.linkPdf) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-gutter-xs mt-gutter-sm font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>Ver informe adjunto</a>'
        : '';

      return (
        '<details class="group">' +
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
          '</div>' +
        '</details>'
      );
    }).join('');
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
      const fotoLink = t.fotoAntesUrl
        ? ' · <a href="' + escapeHtml(t.fotoAntesUrl) + '" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Ver foto</a>'
        : '';

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
    const btnAuth = document.getElementById('btn-open-auth');
    const btnLogout = document.getElementById('btn-logout');

    if (!user) {
      roleBar.classList.add('hidden');
      roleBar.classList.remove('flex');
      btnMaint.classList.add('hidden');
      btnMaint.classList.remove('inline-flex');
      btnAdmin.classList.add('hidden');
      btnAdmin.classList.remove('inline-flex');
      btnAuth.classList.remove('hidden');
      btnLogout.classList.add('hidden');
      return;
    }

    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    roleText.textContent = user.nombre + ' (' + user.rol.toUpperCase() + ')';

    const canMaint = user.rol === 'tecnico' || user.rol === 'admin';
    const isAdmin = user.rol === 'admin';

    if (canMaint || isAdmin) {
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

    ['modal-report', 'modal-auth', 'modal-maintenance', 'modal-admin'].forEach(function (id) {
      const m = document.getElementById(id);
      m.addEventListener('click', function (e) {
        if (e.target === m) closeModal(id);
      });
    });

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
      const file = e.target.files[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file, 1024, 0.75);
        state.reportPhotoBase64 = compressed.dataUrl;
        document.getElementById('photo-label').textContent = 'Foto lista';
        document.getElementById('report-photo-preview').src = compressed.dataUrl;
        document.getElementById('report-photo-size').textContent = Math.round(compressed.bytes / 1024) + ' KB';
        const wrap = document.getElementById('report-photo-preview-wrap');
        wrap.classList.remove('hidden');
        wrap.classList.add('flex');
      } catch (err) {
        showToast('No se pudo procesar la imagen', true);
      }
    });

    document.getElementById('btn-remove-report-photo').addEventListener('click', function () {
      clearReportPhoto();
    });

    document.getElementById('sheet-report-form').addEventListener('submit', async function (e) {
      e.preventDefault();

      const btn = document.getElementById('btn-submit-report');
      setLoadingBtn(btn, true, 'Enviando reporte...');

      const descRaw = document.getElementById('resident-desc').value.trim();
      const descripcion = '[' + state.reportCategory + '] ' + descRaw;

      const res = await postApi({
        action: 'createTicket',
        token: state.session ? state.session.token : '',
        edificioId: state.edificioId,
        equipoId: state.equipoId,
        depto: document.getElementById('resident-unit').value.trim(),
        emailVecino: document.getElementById('resident-email').value.trim(),
        descripcion: descripcion,
        fotoBase64: state.reportPhotoBase64,
        fotoMimeType: 'image/jpeg',
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
        document.getElementById('btn-auth-label').textContent = state.authMode === 'register' ? 'Solicitar registro técnico' : 'Ingresar';
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
        payload.rol = 'tecnico';
      }

      const res = await postApi(payload);
      setLoadingBtn(btn, false, state.authMode === 'register' ? 'Solicitar registro técnico' : 'Ingresar');

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

      saveSession({ token: res.token, user: res.user });
      closeModal('modal-auth');
      document.getElementById('auth-form').reset();
      showToast('Bienvenido/a, ' + res.user.nombre);
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
      openModal('modal-maintenance');
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
      const file = e.target.files[0];
      if (!file) return;
      const label = document.getElementById('maint-file-label');

      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file, 1280, 0.8);
        state.maintFileBase64 = compressed.dataUrl;
        state.maintFileMime = 'image/jpeg';
        label.textContent = file.name + ' (optimizada)';
      } else {
        if (file.size > 6 * 1024 * 1024) {
          showToast('El PDF supera los 6 MB permitidos', true);
          return;
        }
        state.maintFileBase64 = await readFileAsDataUrl(file);
        state.maintFileMime = file.type || 'application/pdf';
        label.textContent = file.name;
      }
    });

    document.getElementById('sheet-maint-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!state.session) return;

      const btn = document.getElementById('btn-maint-submit');
      setLoadingBtn(btn, true, 'Publicando...');

      const res = await postApi({
        action: 'addMaintenance',
        token: state.session.token,
        edificioId: state.edificioId,
        equipoId: state.equipoId,
        tipo: state.maintType,
        estadoResultante: state.maintState,
        observaciones: document.getElementById('maint-sheet-notes').value.trim(),
        archivoBase64: state.maintFileBase64,
        archivoMimeType: state.maintFileMime,
      });

      setLoadingBtn(btn, false, 'Guardar y publicar registro');

      if (!res.ok) {
        showToast(res.error || 'Error al registrar mantención', true);
        return;
      }

      document.getElementById('sheet-maint-form').reset();
      state.maintFileBase64 = '';
      state.maintFileMime = '';
      document.getElementById('maint-file-label').textContent = 'Adjuntar Informe Técnico (PDF o Foto)';
      closeModal('modal-maintenance');
      showToast(res.message || 'Mantención publicada');
      loadData();
    });

    document.getElementById('btn-open-admin').addEventListener('click', function () {
      openModal('modal-admin');
      loadAdminPanelData();
    });

    document.querySelectorAll('.admin-panel-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const target = tab.getAttribute('data-admin-tab');
        document.querySelectorAll('.admin-panel-tab').forEach(function (t) {
          t.className = t === tab
            ? 'admin-panel-tab py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-label-md'
            : 'admin-panel-tab py-gutter-sm rounded-sm text-on-surface-variant font-label text-label-md';
        });
        document.getElementById('admin-tab-tickets').classList.toggle('hidden', target !== 'tickets');
        document.getElementById('admin-tab-tickets').classList.toggle('flex', target === 'tickets');
        document.getElementById('admin-tab-usuarios').classList.toggle('hidden', target !== 'usuarios');
        document.getElementById('admin-tab-usuarios').classList.toggle('flex', target === 'usuarios');
      });
    });
  }

  function clearReportPhoto() {
    state.reportPhotoBase64 = '';
    document.getElementById('report-photo-input').value = '';
    document.getElementById('photo-label').textContent = 'Subir foto';
    const wrap = document.getElementById('report-photo-preview-wrap');
    wrap.classList.add('hidden');
    wrap.classList.remove('flex');
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
      renderAdminTickets(json.tickets || []);
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
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm" data-ticket-id="' + escapeHtml(t.id) + '">' +
          '<div class="flex items-start justify-between gap-gutter-sm">' +
            '<span class="font-mono text-mono-sm text-on-surface-variant">' + escapeHtml(t.id) + ' · #' + escapeHtml(t.equipoId) + ' · ' + escapeHtml(t.depto) + '</span>' +
            '<span class="px-gutter-sm py-gutter-xs rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">' + escapeHtml(t.estado) + '</span>' +
          '</div>' +
          '<p class="font-title text-title-sm text-on-surface">' + escapeHtml(t.descripcion) + '</p>' +
          '<input type="text" placeholder="Comentario de gestión o cierre..." class="admin-ticket-note w-full rounded-md border border-outline bg-surface-card text-on-surface font-body text-body-sm px-gutter-md py-gutter-xs">' +
          '<div class="flex items-center gap-gutter-sm">' +
            '<input type="file" accept="image/*" class="admin-ticket-file hidden">' +
            '<button type="button" class="btn-admin-ticket-photo flex-1 inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-md border border-dashed border-primary bg-primary-container text-on-primary-container font-label text-label-sm">' +
              '<span class="material-symbols-outlined text-[16px]">add_a_photo</span>' +
              '<span class="admin-photo-text">Foto respaldo</span>' +
            '</button>' +
            '<button type="button" data-next-state="En Proceso" class="btn-admin-ticket-save px-gutter-md py-gutter-xs rounded-md bg-warning-container text-on-warning-container font-label text-label-sm">En Proceso</button>' +
            '<button type="button" data-next-state="Resuelto" class="btn-admin-ticket-save px-gutter-md py-gutter-xs rounded-md bg-success-container text-on-success-container font-label text-label-sm">Resolver</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    container.querySelectorAll('article[data-ticket-id]').forEach(function (card) {
      let fotoDespuesBase64 = '';
      const fileInput = card.querySelector('.admin-ticket-file');
      const photoBtn = card.querySelector('.btn-admin-ticket-photo');
      const photoText = card.querySelector('.admin-photo-text');

      photoBtn.addEventListener('click', function () {
        fileInput.click();
      });

      fileInput.addEventListener('change', async function (e) {
        const f = e.target.files[0];
        if (!f) return;
        const compressed = await compressImage(f, 1024, 0.75);
        fotoDespuesBase64 = compressed.dataUrl;
        photoText.textContent = 'Foto lista';
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
            fotoDespuesBase64: fotoDespuesBase64,
            fotoDespuesMimeType: 'image/jpeg',
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

  function renderAdminUsers(usuarios) {
    const container = document.getElementById('admin-tab-usuarios');
    const pendientes = usuarios.filter(function (u) {
      return u.estado === 'pendiente';
    });

    if (pendientes.length === 0) {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">No hay cuentas pendientes de aprobación.</p>';
      return;
    }

    container.innerHTML = pendientes.map(function (u) {
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

  async function postApi(payload) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err) {
      return { ok: false, error: 'Error de conexión al enviar datos.' };
    }
  }

  function compressImage(file, maxWidth, quality) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function (ev) {
        const img = new Image();
        img.onerror = reject;
        img.onload = function () {
          let w = img.width;
          let h = img.height;
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
          resolve({ dataUrl: dataUrl, bytes: approxBytes });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
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
    if (t.includes('jard') || t.includes('riego')) return 'yard';
    return 'precision_manufacturing';
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
