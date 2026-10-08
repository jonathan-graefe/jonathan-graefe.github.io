/* Smooth open/close for <details> elements (earlier news, abstracts).
   Falls back to the browser's normal behaviour if animations are unavailable or reduced motion is requested. */
(function () {
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce || !Element.prototype.animate) return;

	Array.prototype.forEach.call(document.querySelectorAll('details'), function (d) {
		var summary = d.querySelector('summary');
		if (!summary) return;

		/* put everything except the summary into one wrapper we can animate */
		var body = document.createElement('div');
		body.className = 'details-body';
		while (summary.nextSibling) body.appendChild(summary.nextSibling);
		d.appendChild(body);

		var running = null;

		function finish() { running = null; body.style.height = ''; }

		summary.addEventListener('click', function (e) {
			e.preventDefault();
			if (running) running.cancel();
			d.classList.remove('closing');

			if (!d.open) {
				d.open = true;
				var h = body.offsetHeight;
				running = body.animate(
					{ height: ['0px', h + 'px'], opacity: [0, 1], transform: ['translateY(-6px)', 'translateY(0)'] },
					{ duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
				);
				running.onfinish = finish;
				running.oncancel = finish;
			} else {
				d.classList.add('closing');
				var start = body.offsetHeight;
				var anim = body.animate(
					{ height: [start + 'px', '0px'], opacity: [1, 0], transform: ['translateY(0)', 'translateY(-6px)'] },
					{ duration: 240, easing: 'ease-in' }
				);
				running = anim;
				var done = function () {
					if (running !== anim) return;
					d.open = false;
					d.classList.remove('closing');
					anim.cancel();
				};
				anim.onfinish = done;
				anim.oncancel = function () { if (running === anim) finish(); };
				/* safety net: close even if the page is in the background and no frames are drawn */
				setTimeout(done, 300);
			}
		});
	});
})();
