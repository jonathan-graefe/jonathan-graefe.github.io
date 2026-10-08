/* Gentle motion: content rises into view while scrolling, and pages fade between each other.
   Everything is skipped when the visitor prefers reduced motion. */
(function () {
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) return;

	/* ---- reveal on scroll ---- */
	if ('IntersectionObserver' in window) {
		try {
			var els = document.querySelectorAll('.paper, .research-figure, .video-card, .features article, .entry, .facts, .table-wrap');
			if (els.length) {
				document.documentElement.classList.add('reveal-ready');
				Array.prototype.forEach.call(els, function (el) { el.classList.add('reveal'); });

				var show = function (el, i) {
					if (!el.classList.contains('reveal') || el.classList.contains('is-visible')) return;
					el.style.animationDelay = Math.min(i * 70, 280) + 'ms';
					el.classList.add('is-visible');
					io.unobserve(el);
					el.addEventListener('animationend', function () {
						el.classList.remove('reveal', 'is-visible');
						el.style.animationDelay = '';
					}, { once: true });
				};

				var io = new IntersectionObserver(function (entries) {
					entries.filter(function (en) { return en.isIntersecting; })
						.forEach(function (en, i) { show(en.target, i); });
				}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

				Array.prototype.forEach.call(els, function (el) { io.observe(el); });

				/* safety net: anything already on screen after a moment is shown, whatever the observer did */
				setTimeout(function () {
					var n = 0;
					Array.prototype.forEach.call(document.querySelectorAll('.reveal:not(.is-visible)'), function (el) {
						var r = el.getBoundingClientRect();
						if (r.height > 0 && r.top < window.innerHeight && r.bottom > 0) show(el, n++);
					});
				}, 1500);
			}
		} catch (err) {
			document.documentElement.classList.remove('reveal-ready');
		}
	}

	/* ---- page fade-out when following an internal link ---- */
	document.addEventListener('click', function (e) {
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		var a = e.target.closest ? e.target.closest('a') : null;
		if (!a) return;
		var href = a.getAttribute('href');
		if (!href || href.charAt(0) === '#' || /^(mailto|tel):/.test(href)) return;
		if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.classList.contains('gallery-item')) return;
		var u;
		try { u = new URL(a.href, location.href); } catch (err) { return; }
		if (u.origin !== location.origin) return;
		if (u.pathname === location.pathname && u.search === location.search) return;
		e.preventDefault();
		document.body.classList.add('is-leaving');
		setTimeout(function () { location.href = a.href; }, 180);
	});

	/* coming back with the browser's back button must not show a faded page */
	window.addEventListener('pageshow', function () { document.body.classList.remove('is-leaving'); });
})();
