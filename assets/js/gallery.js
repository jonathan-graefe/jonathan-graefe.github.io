/* Simple lightbox for links with class "gallery-item". No dependencies. */
(function () {
	var items = Array.prototype.slice.call(document.querySelectorAll('a.gallery-item'));
	if (!items.length) return;

	var style = document.createElement('style');
	style.textContent = '.lightbox {\n\tposition: fixed;\n\ttop: 0;\n\tright: 0;\n\tbottom: 0;\n\tleft: 0;\n\tz-index: 10000;\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\tbackground: rgba(8, 7, 20, 0.93);\n}\n\n.lightbox[hidden] {\n\tdisplay: none;\n}\n\n.lightbox figure {\n\tmargin: 0;\n\tmax-width: 92vw;\n\ttext-align: center;\n}\n\n.lightbox img {\n\tdisplay: block;\n\tmax-width: 92vw;\n\tmax-height: 82vh;\n\tmax-height: 82dvh;\n\tmargin: 0 auto;\n\tborder-radius: 6px;\n\tbox-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);\n}\n\n.lightbox figcaption {\n\tmargin-top: 0.8em;\n\tfont-size: 0.85em;\n\tcolor: rgba(255, 255, 255, 0.75);\n}\n\n.lightbox button {\n\tposition: absolute;\n\twidth: 2.6em;\n\theight: 2.6em;\n\tpadding: 0;\n\tline-height: 2.4em;\n\tborder: 0;\n\tborder-radius: 50%;\n\tbackground: rgba(255, 255, 255, 0.1);\n\tcolor: #ffffff;\n\tfont-size: 1.4em;\n\tbox-shadow: none;\n\tcursor: pointer;\n}\n\n.lightbox button:hover {\n\tbackground: rgba(255, 255, 255, 0.22);\n}\n\n.lightbox .lb-close { top: 0.8em; right: 0.8em; }\n.lightbox .lb-prev { left: 0.8em; top: 50%; margin-top: -1.3em; }\n.lightbox .lb-next { right: 0.8em; top: 50%; margin-top: -1.3em; }\n\nhtml.lightbox-open, html.lightbox-open body {\n\toverflow: hidden;\n}';
	style.textContent += '@keyframes lb-fade { from { opacity: 0; } to { opacity: 1; } } '
		+ '@keyframes lb-zoom { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } } '
		+ '.lightbox { animation: lb-fade 0.25s ease; } .lightbox img { animation: lb-zoom 0.3s ease; } '
		+ '@media (prefers-reduced-motion: reduce) { .lightbox, .lightbox img { animation: none; } }';
	document.head.appendChild(style);

	var current = -1, lastFocus = null;

	var box = document.createElement('div');
	box.className = 'lightbox';
	box.setAttribute('role', 'dialog');
	box.setAttribute('aria-modal', 'true');
	box.setAttribute('aria-label', 'Photo viewer');
	box.hidden = true;
	box.innerHTML =
		'<button class="lb-close" aria-label="Close">&times;</button>' +
		'<button class="lb-prev" aria-label="Previous photo">&#8249;</button>' +
		'<figure><img alt=""><figcaption></figcaption></figure>' +
		'<button class="lb-next" aria-label="Next photo">&#8250;</button>';
	document.body.appendChild(box);

	var img = box.querySelector('img'),
		cap = box.querySelector('figcaption'),
		closeBtn = box.querySelector('.lb-close');

	function show(n) {
		current = (n + items.length) % items.length;
		img.style.animation = 'none';
		void img.offsetWidth;
		img.style.animation = '';
		img.src = items[current].getAttribute('href');
		img.alt = items[current].getAttribute('data-caption') || '';
		cap.textContent = (current + 1) + ' / ' + items.length + (img.alt ? '  ·  ' + img.alt : '');
	}

	function open(n) {
		lastFocus = document.activeElement;
		show(n);
		box.hidden = false;
		document.documentElement.classList.add('lightbox-open');
		closeBtn.focus();
	}

	function close() {
		box.hidden = true;
		img.removeAttribute('src');
		document.documentElement.classList.remove('lightbox-open');
		if (lastFocus) lastFocus.focus();
	}

	items.forEach(function (a, n) {
		a.addEventListener('click', function (e) { e.preventDefault(); open(n); });
	});

	box.addEventListener('click', function (e) {
		if (e.target === box || e.target.tagName === 'FIGURE') close();
	});
	closeBtn.addEventListener('click', close);
	box.querySelector('.lb-prev').addEventListener('click', function () { show(current - 1); });
	box.querySelector('.lb-next').addEventListener('click', function () { show(current + 1); });

	document.addEventListener('keydown', function (e) {
		if (box.hidden) return;
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowLeft') show(current - 1);
		else if (e.key === 'ArrowRight') show(current + 1);
	});

	/* swipe on touch screens */
	var x0 = null;
	box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
	box.addEventListener('touchend', function (e) {
		if (x0 === null) return;
		var dx = e.changedTouches[0].clientX - x0;
		if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
		x0 = null;
	});
})();
