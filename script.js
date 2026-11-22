document.addEventListener('DOMContentLoaded', () => {
    // Menú Móvil con cierre automático al seleccionar un enlace
    const mobileMenu = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    const navItems = document.querySelectorAll('.nav-links a');

    if (mobileMenu && navLinks) {
        mobileMenu.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.toggle('is-active');
            navLinks.classList.toggle('active');
            mobileMenu.setAttribute('aria-expanded', String(isOpen));
        });

        navItems.forEach((item) => {
            item.addEventListener('click', () => {
                mobileMenu.classList.remove('is-active');
                navLinks.classList.remove('active');
                mobileMenu.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // Banner de Cookies (Ley 21.719)
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptCookiesBtn = document.getElementById('accept-cookies');

    if (cookieBanner && !localStorage.getItem('gcoCookiesAccepted')) {
        cookieBanner.style.display = 'flex';
        document.body.classList.add('cookie-banner-visible');
    }

    if (acceptCookiesBtn && cookieBanner) {
        acceptCookiesBtn.addEventListener('click', () => {
            localStorage.setItem('gcoCookiesAccepted', 'true');
            cookieBanner.style.display = 'none';
            document.body.classList.remove('cookie-banner-visible');
            if (typeof gtag === 'function') {
                gtag('consent', 'update', {
                    'analytics_storage': 'granted'
                });
            }
        });
    }

    // Simulador de Morosidad
    const simUnidades = document.getElementById('sim-unidades');
    const simGgcc = document.getElementById('sim-ggcc');
    const simMorosidad = document.getElementById('sim-morosidad');
    const simRecuperacion = document.getElementById('sim-recuperacion');

    if (simUnidades && simGgcc && simMorosidad && simRecuperacion) {
        const valUnidades = document.getElementById('val-unidades');
        const valGgcc = document.getElementById('val-ggcc');
        const valMorosidad = document.getElementById('val-morosidad');
        const valRecuperacion = document.getElementById('val-recuperacion');

        const resMensual = document.getElementById('res-mensual');
        const resAnual = document.getElementById('res-anual');
        const resRecuperable = document.getElementById('res-recuperable');
        const resEquivalencia = document.getElementById('res-equivalencia');
        const simWhatsappLink = document.getElementById('sim-whatsapp-link');

        const formatCLP = (num) => new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            maximumFractionDigits: 0
        }).format(Math.round(num));

        const actualizarSimulador = () => {
            const unidades = Number(simUnidades.value);
            const ggcc = Number(simGgcc.value);
            const morosidadPct = Number(simMorosidad.value) / 100;
            const recuperacionPct = Number(simRecuperacion.value) / 100;

            const facturacionMensual = unidades * ggcc;
            const deudaMensual = facturacionMensual * morosidadPct;
            const deudaAnual = deudaMensual * 12;
            const recuperableAnual = deudaAnual * recuperacionPct;
            const mesesGgcc = facturacionMensual > 0 ? (recuperableAnual / facturacionMensual) : 0;

            if (valUnidades) valUnidades.textContent = `${unidades} unidades`;
            if (valGgcc) valGgcc.textContent = formatCLP(ggcc);
            if (valMorosidad) valMorosidad.textContent = `${simMorosidad.value}%`;
            if (valRecuperacion) valRecuperacion.textContent = `${simRecuperacion.value}%`;

            if (resMensual) resMensual.textContent = formatCLP(deudaMensual);
            if (resAnual) resAnual.innerHTML = `Equivale a <strong>${formatCLP(deudaAnual)}</strong> sin ingresar al año`;
            if (resRecuperable) resRecuperable.textContent = formatCLP(recuperableAnual);
            if (resEquivalencia) {
                resEquivalencia.innerHTML = `Equivale a aprox. <strong>${mesesGgcc.toFixed(1).replace('.', ',')} meses</strong> de gasto común total de la comunidad.`;
            }

            if (simWhatsappLink) {
                const textoWa = `Hola GCO, simulé la morosidad de mi comunidad (${unidades} unidades, GGCC promedio ${formatCLP(ggcc)}, morosidad ${simMorosidad.value}%) y me gustaría evaluar una revisión sin costo.`;
                simWhatsappLink.href = `https://wa.me/56989249132?text=${encodeURIComponent(textoWa)}`;
            }
        };

        [simUnidades, simGgcc, simMorosidad, simRecuperacion].forEach((input) => {
            input.addEventListener('input', actualizarSimulador);
        });

        actualizarSimulador();
    }

    // Visores interactivos con pestañas (GCO App en index.html y gco-app.html)
    document.querySelectorAll('[data-app-tabs]').forEach((container) => {
        const buttons = container.querySelectorAll('[data-tab-target]');
        const panels = container.querySelectorAll('[data-tab-panel]');
        const previewImg = container.querySelector('[data-tab-img]');
        const previewCaption = container.querySelector('[data-tab-caption]');

        const activateTab = (btn) => {
            const target = btn.getAttribute('data-tab-target');
            const imgSrc = btn.getAttribute('data-img');
            const imgAlt = btn.getAttribute('data-alt');
            const caption = btn.getAttribute('data-caption');

            buttons.forEach((b) => {
                const active = b === btn;
                b.classList.toggle('is-active', active);
                b.setAttribute('aria-selected', String(active));
            });

            panels.forEach((p) => {
                p.hidden = p.getAttribute('data-tab-panel') !== target;
            });

            if (previewImg && imgSrc) {
                previewImg.src = imgSrc;
                if (imgAlt) previewImg.alt = imgAlt;
            }
            if (previewCaption && caption) {
                previewCaption.textContent = caption;
            }
        };

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => activateTab(btn));
        });
    });

    // Comparador Sin / Con GCO App
    document.querySelectorAll('[data-app-compare]').forEach((box) => {
        const toggleBtns = box.querySelectorAll('[data-mode]');
        const lists = box.querySelectorAll('[data-active-mode]');

        toggleBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                toggleBtns.forEach((b) => {
                    const active = b === btn;
                    b.classList.toggle('is-active', active);
                    b.setAttribute('aria-pressed', String(active));
                });
                lists.forEach((list) => {
                    list.hidden = list.getAttribute('data-active-mode') !== mode;
                });
            });
        });
    });

    // Recorrido guiado paso a paso (gco-app.html)
    document.querySelectorAll('[data-app-steps]').forEach((walkthrough) => {
        const stepBtns = Array.from(walkthrough.querySelectorAll('[data-step-index]'));
        const stepPanels = Array.from(walkthrough.querySelectorAll('[data-step-panel]'));
        const prevBtn = walkthrough.querySelector('[data-step-prev]');
        const nextBtn = walkthrough.querySelector('[data-step-next]');
        const pauseBtn = walkthrough.querySelector('[data-step-pause]');
        const stepImg = walkthrough.querySelector('[data-step-img]');

        if (!stepBtns.length) return;

        let current = 0;
        let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let timerId = null;

        const showStep = (idx) => {
            current = (idx + stepBtns.length) % stepBtns.length;
            stepBtns.forEach((b, i) => {
                const active = i === current;
                b.classList.toggle('is-active', active);
                b.setAttribute('aria-current', active ? 'step' : 'false');
            });
            stepPanels.forEach((p, i) => {
                p.hidden = i !== current;
            });
            const imgSrc = stepBtns[current].getAttribute('data-img');
            const imgAlt = stepBtns[current].getAttribute('data-alt');
            if (stepImg && imgSrc) {
                stepImg.src = imgSrc;
                if (imgAlt) stepImg.alt = imgAlt;
            }
        };

        const syncPauseBtn = () => {
            if (pauseBtn) pauseBtn.textContent = paused ? 'Reanudar' : 'Pausar';
        };

        const startAuto = () => {
            if (timerId) clearInterval(timerId);
            if (!paused) {
                timerId = setInterval(() => showStep(current + 1), 5000);
            }
        };

        stepBtns.forEach((b, i) => {
            b.addEventListener('click', () => {
                showStep(i);
                startAuto();
            });
        });

        if (prevBtn) prevBtn.addEventListener('click', () => { showStep(current - 1); startAuto(); });
        if (nextBtn) nextBtn.addEventListener('click', () => { showStep(current + 1); startAuto(); });
        if (pauseBtn) {
            syncPauseBtn();
            pauseBtn.addEventListener('click', () => {
                paused = !paused;
                syncPauseBtn();
                startAuto();
            });
        }

        showStep(0);
        startAuto();
    });
});
