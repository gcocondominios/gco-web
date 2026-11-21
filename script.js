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
    }

    if (acceptCookiesBtn && cookieBanner) {
        acceptCookiesBtn.addEventListener('click', () => {
            localStorage.setItem('gcoCookiesAccepted', 'true');
            cookieBanner.style.display = 'none';
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
});
