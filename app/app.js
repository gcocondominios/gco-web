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
    reportPhotos: [],
    quickAuthMode: 'login',
    authMode: 'login',
    maintType: 'Preventiva',
    maintState: 'Operativo',
    maintFiles: [],
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
      const pdfLinks = splitLinks(m.linkPdf);
      const pdfLinkHtml = pdfLinks.length > 0
        ? '<div class="flex flex-wrap gap-gutter-sm mt-gutter-sm">' + pdfLinks.map(function (u, idx) {
            const lbl = pdfLinks.length === 1 ? 'Ver informe adjunto' : 'Adjunto ' + (idx + 1);
            return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-gutter-xs font-label text-label-sm text-primary hover:underline"><span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>' + lbl + '</a>';
          }).join('') + '</div>'
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

    const canMaint = Boolean((user.rol === 'tecnico' || user.rol === 'admin') && state.equipoId);
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

    ['modal-report', 'modal-auth', 'modal-maintenance', 'modal-admin', 'modal-qr'].forEach(function (id) {
      const m = document.getElementById(id);
      if (!m) return;
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
      const descripcion = '[' + state.reportCategory + '] ' + descRaw;

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
        archivos: state.maintFiles.map(function (f) {
          return { base64: f.base64, mimeType: f.mimeType, name: f.name };
        }),
      });

      setLoadingBtn(btn, false, 'Guardar y publicar registro');

      if (!res.ok) {
        showToast(res.error || 'Error al registrar mantención', true);
        return;
      }

      document.getElementById('sheet-maint-form').reset();
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
            ? 'admin-panel-tab py-gutter-sm rounded-sm bg-primary text-on-primary font-label text-label-sm'
            : 'admin-panel-tab py-gutter-sm rounded-sm text-on-surface-variant font-label text-label-sm';
        });
        ['tickets', 'equipos', 'usuarios'].forEach(function (name) {
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
      renderAdminEquipos(json.equipos || []);
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
    if (equipos.length === 0) {
      container.innerHTML = '<p class="font-body text-body-sm text-on-surface-variant">No hay equipos registrados en esta comunidad.</p>';
      return;
    }

    const base = window.location.origin + window.location.pathname;
    const printTopBtn =
      '<button type="button" id="btn-print-all-qr" class="w-full min-h-[42px] inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded-md bg-secondary text-on-secondary font-label text-label-md shadow-sm hover:bg-primary transition-colors duration-state-change">' +
        '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">print</span>' +
        '<span>Imprimir láminas QR (' + equipos.length + ' equipos)</span>' +
      '</button>';

    container.innerHTML = printTopBtn + equipos.map(function (eq, idx) {
      const qrUrl = base + '?edificio=' + encodeURIComponent(eq.edificioId) + '&equipo=' + encodeURIComponent(eq.equipoId);
      const waUrl = 'https://wa.me/?text=' + encodeURIComponent('Ficha QR ' + eq.nombre + ' (' + eq.edificioId + '): ' + qrUrl);
      return (
        '<article class="w-full bg-surface-subtle rounded-lg border border-outline p-gutter-md flex flex-col gap-gutter-sm">' +
          '<div class="flex items-center justify-between gap-gutter-sm">' +
            '<div class="flex flex-col min-w-0">' +
              '<span class="font-title text-title-sm text-on-surface truncate">' + escapeHtml(eq.nombre) + '</span>' +
              '<span class="font-mono text-mono-sm text-on-surface-variant">#' + escapeHtml(eq.equipoId) + ' · ' + escapeHtml(eq.empresa) + '</span>' +
            '</div>' +
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

    setTimeout(function () {
      window.print();
    }, 250);
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
