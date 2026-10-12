/* Interactive tree editor for the massive-correlator tool (uses correlator-core.js and KaTeX). */
(function () {
	var NS = 'http://www.w3.org/2000/svg';
	var W = 800, H = 420, R = 19;

	var svg = document.getElementById('ct-canvas');
	if (!svg || !window.CorrCore) return;

	var els = {
		hint: document.getElementById('ct-hint'),
		status: document.getElementById('ct-status'),
		result: document.getElementById('ct-result'),
		placeholder: document.getElementById('ct-placeholder'),
		formula: document.getElementById('ct-formula'),
		coef: document.getElementById('ct-coef'),
		defs: document.getElementById('ct-defs'),
		region: document.getElementById('ct-region'),
		Q: document.getElementById('ct-Q'),
		Qr: document.getElementById('ct-Qr'),
		P: document.getElementById('ct-P'),
		xs: document.getElementById('ct-xstar'),
		rootInfo: document.getElementById('ct-rootinfo'),
		copy: document.getElementById('ct-copy')
	};

	var HINTS = {
		move: 'Drag a vertex to move it.',
		vertex: 'Click on empty space to add a vertex.',
		edge: 'Click a vertex, then a second one (or drag from one to the other) to connect them with a propagator.',
		root: 'Click a vertex to make it the root. The root fixes the orientation of the tree and the kinematic region.',
		erase: 'Click a vertex or an edge to delete it.'
	};

	var PRESETS = {
		two: { v: [[300, 210], [500, 210]], e: [[0, 1]], root: 0 },
		three: { v: [[210, 210], [400, 210], [590, 210]], e: [[0, 1], [1, 2]], root: 0 },
		star: { v: [[400, 210], [400, 80], [270, 280], [530, 280]], e: [[0, 1], [0, 2], [0, 3]], root: 0 },
		five: { v: [[130, 210], [290, 210], [450, 210], [590, 110], [590, 310]], e: [[0, 1], [1, 2], [2, 3], [2, 4]], root: 1 }
	};

	var state = { v: [], e: [], root: 0, tool: 'move' };
	var pending = -1, drag = -1, rubber = null, lastTex = '';

	/* ---------- helpers ---------- */
	function svgPoint(evt) {
		var pt = svg.createSVGPoint();
		pt.x = evt.clientX; pt.y = evt.clientY;
		var p = pt.matrixTransform(svg.getScreenCTM().inverse());
		return { x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(R, Math.min(H - R, p.y)) };
	}
	function make(tag, attrs, parent) {
		var n = document.createElementNS(NS, tag);
		for (var k in attrs) n.setAttribute(k, attrs[k]);
		if (parent) parent.appendChild(n);
		return n;
	}
	function connected(a, b) {
		var seen = {}, st = [a]; seen[a] = true;
		while (st.length) {
			var x = st.pop();
			state.e.forEach(function (e) {
				var y = e[0] === x ? e[1] : (e[1] === x ? e[0] : -1);
				if (y >= 0 && !seen[y]) { seen[y] = true; st.push(y); }
			});
		}
		return !!seen[b];
	}
	function say(msg) { els.status.textContent = msg || ''; }

	/* orientation away from the root (for the arrows), valid even for a forest */
	function orient() {
		var par = {}, q = [state.root], dir = {};
		par[state.root] = -1;
		for (var i = 0; i < q.length; i++) {
			state.e.forEach(function (e, idx) {
				var u = q[i], w = e[0] === u ? e[1] : (e[1] === u ? e[0] : -1);
				if (w >= 0 && par[w] === undefined) { par[w] = u; dir[idx] = [u, w]; q.push(w); }
			});
		}
		return dir;
	}

	/* ---------- drawing ---------- */
	function draw() {
		while (svg.firstChild) svg.removeChild(svg.firstChild);
		var dir = orient();
		var k = Math.max(1, Math.min(2.8, 650 / (svg.clientWidth || 800)));   /* keep vertices tappable on phones */

		var defs = make('defs', {}, svg);
		var mk = make('marker', { id: 'ct-arrow', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' }, defs);
		make('path', { d: 'M 1 1 L 9 5 L 1 9 z', 'class': 'ct-arrowhead' }, mk);

		var gE = make('g', {}, svg), gV = make('g', {}, svg);

		state.e.forEach(function (e, idx) {
			var a = state.v[e[0]], b = state.v[e[1]];
			make('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'ct-edge', 'data-e': idx }, gE);
			make('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'ct-edge-hit', 'data-e': idx }, gE);
			if (dir[idx]) {
				var p = state.v[dir[idx][0]], c = state.v[dir[idx][1]];
				var mx = (p.x + c.x) / 2, my = (p.y + c.y) / 2;
				var dx = c.x - p.x, dy = c.y - p.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
				/* a short arrow centred on the edge, pointing away from the root */
				make('line', {
					x1: mx - dx / L * 9, y1: my - dy / L * 9, x2: mx + dx / L * 9, y2: my + dy / L * 9,
					'class': 'ct-dir', 'marker-end': 'url(#ct-arrow)'
				}, gE);
			}
		});

		if (rubber && pending >= 0) {
			var s = state.v[pending];
			make('line', { x1: s.x, y1: s.y, x2: rubber.x, y2: rubber.y, 'class': 'ct-rubber' }, gE);
		}

		state.v.forEach(function (v, i) {
			var cls = 'ct-vertex' + (i === state.root ? ' is-root' : '') + (i === pending ? ' is-pending' : '');
			var g = make('g', { 'class': cls, 'data-v': i, tabindex: '-1' }, gV);
			make('circle', { cx: v.x, cy: v.y, r: R * k }, g);
			var t = make('text', { x: v.x, y: v.y + 5.5 * k, 'text-anchor': 'middle', style: 'font-size:' + 16 * k + 'px' }, g);
			t.textContent = i + 1;
			if (i === state.root) {
				var rt = make('text', { x: v.x, y: v.y + (R + 19) * k, 'text-anchor': 'middle', 'class': 'ct-roottag', style: 'font-size:' + 12 * k + 'px !important' }, g);
				rt.textContent = 'root';
			}
		});
		svg.setAttribute('class', 'tool-' + state.tool);
	}

	/* ---------- editing ---------- */
	function addVertex(p) {
		if (state.v.length >= 12) { say('That is plenty of vertices for this tool (maximum 12).'); return; }
		state.v.push({ x: p.x, y: p.y });
		changed();
	}
	function addEdge(a, b) {
		if (a === b) return;
		var dup = state.e.some(function (e) { return (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a); });
		if (dup) { say('These two vertices are already connected.'); return; }
		if (connected(a, b)) { say('That edge would close a loop. Only tree graphs are supported.'); return; }
		state.e.push([a, b]);
		say('');
		changed();
	}
	function removeVertex(i) {
		state.v.splice(i, 1);
		state.e = state.e.filter(function (e) { return e[0] !== i && e[1] !== i; })
			.map(function (e) { return [e[0] > i ? e[0] - 1 : e[0], e[1] > i ? e[1] - 1 : e[1]]; });
		if (state.root === i) state.root = 0;
		else if (state.root > i) state.root--;
		pending = -1;
		changed();
	}
	function removeEdge(i) { state.e.splice(i, 1); changed(); }
	function load(name) {
		var p = PRESETS[name];
		state.v = p.v.map(function (q) { return { x: q[0], y: q[1] }; });
		state.e = p.e.map(function (q) { return q.slice(); });
		state.root = p.root;
		pending = -1; say('');
		changed();
	}

	/* ---------- pointer handling ---------- */
	function target(evt) {
		var n = evt.target;
		while (n && n !== svg) {
			if (n.getAttribute && n.hasAttribute('data-v')) return { v: +n.getAttribute('data-v') };
			if (n.getAttribute && n.hasAttribute('data-e')) return { e: +n.getAttribute('data-e') };
			n = n.parentNode;
		}
		return {};
	}

	function capture(evt) { try { svg.setPointerCapture(evt.pointerId); } catch (e) {} }

	svg.addEventListener('pointerdown', function (evt) {
		if (evt.button !== undefined && evt.button !== 0) return;
		var t = target(evt), p = svgPoint(evt);
		evt.preventDefault();
		say('');
		if (state.tool === 'move') {
			if (t.v !== undefined) { drag = t.v; capture(evt); }
		} else if (state.tool === 'vertex') {
			if (t.v === undefined && t.e === undefined) addVertex(p);
		} else if (state.tool === 'edge') {
			if (t.v !== undefined) {
				if (pending >= 0 && pending !== t.v) { addEdge(pending, t.v); pending = -1; rubber = null; draw(); }
				else { pending = t.v; rubber = p; capture(evt); draw(); }
			} else { pending = -1; rubber = null; draw(); }
		} else if (state.tool === 'root') {
			if (t.v !== undefined) { state.root = t.v; changed(); }
		} else if (state.tool === 'erase') {
			if (t.v !== undefined) removeVertex(t.v);
			else if (t.e !== undefined) removeEdge(t.e);
		}
	});

	svg.addEventListener('pointermove', function (evt) {
		if (drag >= 0) {
			var p = svgPoint(evt);
			state.v[drag].x = p.x; state.v[drag].y = p.y;
			draw();
		} else if (state.tool === 'edge' && pending >= 0) {
			rubber = svgPoint(evt);
			draw();
		}
	});

	function release(evt) {
		if (drag >= 0) { drag = -1; try { svg.releasePointerCapture(evt.pointerId); } catch (e) {} return; }
		if (state.tool === 'edge' && pending >= 0 && evt.type === 'pointerup') {
			var el = document.elementFromPoint(evt.clientX, evt.clientY), v;
			while (el && el !== svg && !(el.getAttribute && el.hasAttribute('data-v'))) el = el.parentNode;
			v = el && el !== svg ? +el.getAttribute('data-v') : -1;
			if (v >= 0 && v !== pending) { addEdge(pending, v); pending = -1; }
			else if (v < 0) pending = -1;           /* a drag that ended on empty space cancels */
			rubber = null;
			try { svg.releasePointerCapture(evt.pointerId); } catch (e) {}
			draw();
		}
	}
	svg.addEventListener('pointerup', release);
	svg.addEventListener('pointercancel', function (evt) { drag = -1; pending = -1; rubber = null; draw(); });

	document.addEventListener('keydown', function (evt) {
		if (evt.key === 'Escape' && pending >= 0) { pending = -1; rubber = null; draw(); }
	});

	/* ---------- toolbar ---------- */
	function setTool(name) {
		state.tool = name; pending = -1; rubber = null;
		Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
			var on = b.getAttribute('data-tool') === name;
			b.classList.toggle('is-active', on);
			b.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
		els.hint.textContent = HINTS[name];
		say('');
		draw();
	}
	Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
		b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
	});
	Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
		b.addEventListener('click', function () { load(b.getAttribute('data-preset')); });
	});
	document.getElementById('ct-clear').addEventListener('click', function () {
		state.v = []; state.e = []; state.root = 0; pending = -1; say(''); changed();
	});

	/* ---------- output ---------- */
	function tex(el, src, display) {
		if (window.katex) {
			try { window.katex.render(src, el, { displayMode: display !== false, throwOnError: false }); return; } catch (e) {}
		}
		el.textContent = src;
	}

	function update() {
		var V = state.v.length;
		var edges = state.e.map(function (e) { return [e[0] + 1, e[1] + 1]; });
		var A = CorrCore.analyze(V, edges, state.root + 1);
		if (!A.ok) {
			els.result.hidden = true;
			els.placeholder.hidden = false;
			els.placeholder.textContent = A.error;
			return;
		}
		var out = CorrCore.build(A);
		els.placeholder.hidden = true;
		els.result.hidden = false;

		els.rootInfo.textContent = V === 1
			? 'Single vertex (contact diagram).'
			: V + ' vertices, ' + A.I + ' internal line' + (A.I === 1 ? '' : 's') + ', root at vertex ' + A.root + '.';

		tex(els.formula, out.formula);
		tex(els.coef, 'C=' + out.coefficient, false);
		var rows = [
			['Lauricella function', 'F_C^{(n)}\\!\\left[\\left.\\begin{matrix}a,\\,b\\\\ c_1,\\dots,c_n\\end{matrix}\\right|z_1,\\dots,z_n\\right]=\\sum_{k_1,\\dots,k_n=0}^{\\infty}\\frac{(a)_{|k|}\\,(b)_{|k|}}{(c_1)_{k_1}\\cdots(c_n)_{k_n}}\\,\\frac{z_1^{k_1}\\cdots z_n^{k_n}}{k_1!\\cdots k_n!}'],
			['Modified twist', '\\tilde p_i=p_i+\\frac{n_i-2}{2}\\,d,\\qquad ' + out.degrees.join(',\\ ')],
			['Energy ratio', 'u_{ij}=Y_{ij}/X_i'],
			['Subset sums', '\\tilde p_S=\\sum_{k\\in S}\\tilde p_k,\\qquad m_S=\\sum_{k\\in S}m_k' + (A.I ? ',\\qquad |m|=' + out.mTotal : '')]
		];
		els.defs.innerHTML = '';
		rows.forEach(function (r) {
			var row = document.createElement('div'), name = document.createElement('div'), m = document.createElement('div');
			row.className = 'ct-def'; name.className = 'ct-def-name'; m.className = 'ct-def-math';
			name.textContent = r[0];
			row.appendChild(name); row.appendChild(m); els.defs.appendChild(row);
			tex(m, r[1], true);
		});
		els.region.parentNode.hidden = !out.region;
		if (out.region) tex(els.region, out.region, false);

		var steps = document.getElementById('ct-steps');
		steps.hidden = A.I === 0;
		if (A.I > 0) {
			tex(els.Q, 'Q=' + out.Q);
			tex(els.Qr, 'Q_{' + A.root + '}=' + out.Qr);
			tex(els.P, 'P_{' + A.root + '}=Q_{' + A.root + '}^{-1}=' + out.P);
			tex(els.xs, out.xstar);
		}

		lastTex = '% maximally-nested analytic contribution, root ' + A.root + '\n' +
			'% C = ' + out.coefficient + '\n' + out.formula;
	}

	function changed() { draw(); update(); if (window.CorrFull) fullSync(); }

	els.copy.addEventListener('click', function () {
		var done = function () { els.copy.textContent = 'Copied'; setTimeout(function () { els.copy.textContent = 'Copy LaTeX'; }, 1600); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastTex).then(done, function () {});
		else {
			var ta = document.createElement('textarea');
			ta.value = lastTex; document.body.appendChild(ta); ta.select();
			try { document.execCommand('copy'); done(); } catch (e) {}
			document.body.removeChild(ta);
		}
	});

	/* KaTeX is loaded with `defer`; if it arrives late, typeset again */
	window.addEventListener('load', function () { if (window.katex) update(); });


	/* ---------- full correlator (optional) ---------- */
	var MAXV_FULL = 6;
	var full = { order: [], sig: '', tex: [], busy: false, token: 0 };
	var fe = {
		order: document.getElementById('ct-order'),
		run: document.getElementById('ct-full-run'),
		reset: document.getElementById('ct-order-reset'),
		note: document.getElementById('ct-full-note'),
		result: document.getElementById('ct-full-result'),
		master: document.getElementById('ct-full-master'),
		valid: document.getElementById('ct-full-valid'),
		defs: document.getElementById('ct-full-defs'),
		copy: document.getElementById('ct-full-copy'),
		count: document.getElementById('ct-full-count'),
		configs: document.getElementById('ct-configs'),
		prog: document.getElementById('ct-progress'),
		progFill: document.getElementById('ct-progress-fill'),
		progLabel: document.getElementById('ct-progress-label')
	};

	function graphNow() {
		return {
			V: state.v.length,
			edges: state.e.map(function (e) { return [e[0] + 1, e[1] + 1]; }),
			root: state.root + 1
		};
	}

	/* progress bar: pct in [0,1], or null to hide */
	function setProgress(pct, label) {
		if (pct === null) { fe.prog.hidden = true; return; }
		fe.prog.hidden = false;
		var v = Math.max(0, Math.min(1, pct));
		fe.progFill.style.width = (v * 100).toFixed(1) + '%';
		fe.prog.setAttribute('aria-valuenow', String(Math.round(v * 100)));
		if (label !== undefined) fe.progLabel.textContent = label;
	}

	function fullInvalidate(msg) {
		full.token++;
		fe.result.hidden = true;
		fe.configs.innerHTML = '';
		setProgress(null);
		full.busy = false;
		fe.run.disabled = false;
		if (msg !== undefined) fe.note.textContent = msg;
	}

	function renderOrder() {
		fe.order.innerHTML = '';
		full.order.forEach(function (v, i) {
			if (i) {
				var sep = document.createElement('span');
				sep.className = 'ct-ord-sep'; sep.textContent = '>';
				sep.setAttribute('aria-hidden', 'true');
				fe.order.appendChild(sep);
			}
			var chip = document.createElement('span');
			chip.className = 'ct-ord'; chip.setAttribute('role', 'listitem');
			var l = document.createElement('button'), r = document.createElement('button'), lab = document.createElement('span');
			l.type = r.type = 'button';
			l.textContent = '‹'; r.textContent = '›';
			l.setAttribute('aria-label', 'Move vertex ' + v + ' to a higher energy');
			r.setAttribute('aria-label', 'Move vertex ' + v + ' to a lower energy');
			l.disabled = (i === 0); r.disabled = (i === full.order.length - 1);
			lab.innerHTML = '<i>X</i><sub>' + v + '</sub>';
			l.addEventListener('click', function () { moveOrder(i, -1); });
			r.addEventListener('click', function () { moveOrder(i, +1); });
			chip.appendChild(l); chip.appendChild(lab); chip.appendChild(r);
			fe.order.appendChild(chip);
		});
	}

	function moveOrder(i, d) {
		var j = i + d;
		if (j < 0 || j >= full.order.length) return;
		var t = full.order[i]; full.order[i] = full.order[j]; full.order[j] = t;
		renderOrder();
		fullInvalidate('The ordering changed. Compute again to update the result.');
	}

	function fullSync() {
		var g = graphNow();
		var A = g.V ? CorrCore.analyze(g.V, g.edges, g.root) : { ok: false };
		var sig = A.ok ? g.V + '|' + g.edges.map(String).sort().join(';') + '|' + g.root : '';
		var had = !fe.result.hidden;
		if (A.ok && sig !== full.sig) full.order = CorrFull.defaultOrder(g.V, g.edges, g.root);
		full.sig = sig;
		renderOrder();
		if (!A.ok) {
			fe.order.innerHTML = '';
			fullInvalidate('Draw a connected tree first.');
			fe.run.disabled = true; fe.reset.disabled = true;
			return;
		}
		fe.reset.disabled = false;
		if (g.V > MAXV_FULL) {
			fullInvalidate('The full correlator is limited to ' + MAXV_FULL + ' vertices: it contains 2^V colourings and the number of terms grows quickly. This graph has ' + g.V + '.');
			fe.run.disabled = true;
			return;
		}
		fe.run.disabled = false;
		if (had) fullInvalidate('The graph changed. Compute again to update the result.');
		else fe.note.textContent = (1 << (g.V - 1)) + ' colourings up to complex conjugation.';
	}

	fe.reset.addEventListener('click', function () {
		var g = graphNow();
		full.order = CorrFull.defaultOrder(g.V, g.edges, g.root);
		renderOrder();
		fullInvalidate('Ordering reset to follow the tree away from the root.');
	});

	function miniDiagram(col) {
		var W = 150, H = 66, pad = 10;
		var xs = state.v.map(function (v) { return v.x; }), ys = state.v.map(function (v) { return v.y; });
		var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
		var sx = (W - 2 * pad) / Math.max(x1 - x0, 1), sy = (H - 2 * pad) / Math.max(y1 - y0, 1);
		var k = Math.min(sx, sy, 1.2);
		var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		function X(v) { return W / 2 + (state.v[v].x - cx) * k; }
		function Y(v) { return H / 2 + (state.v[v].y - cy) * k; }
		var svgS = document.createElementNS(NS, 'svg');
		svgS.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svgS.setAttribute('class', 'ct-mini'); svgS.setAttribute('aria-hidden', 'true');
		state.e.forEach(function (e) {
			var same = col[e[0] + 1] === col[e[1] + 1];
			make('line', { x1: X(e[0]), y1: Y(e[0]), x2: X(e[1]), y2: Y(e[1]), 'class': same ? 'ct-mini-e' : 'ct-mini-e ct-mini-cut' }, svgS);
		});
		state.v.forEach(function (v, i) {
			make('circle', { cx: X(i), cy: Y(i), r: 6.5, 'class': col[i + 1] > 0 ? 'ct-mini-v ct-mini-plus' : 'ct-mini-v ct-mini-minus' }, svgS);
		});
		return svgS;
	}

	function defsRows() {
		return [
			['Coefficient', '\\mathcal C^{(n)}_{+}(p)=\\pi^{-n}\\,e^{-\\frac{i\\pi}{2}\\left(p+\\frac{n-2}{2}d-n\\right)},\\qquad \\mathcal C_-=\\mathcal C_+^{*}'],
			['Mode of a leg', '\\alpha_{ij}=i\\,\\sigma_{ij}\\,\\mu_{ij},\\qquad \\sigma_{ij}=\\pm1'],
			['Mode function', '\\mathcal F^{(n)}_{\\alpha}(u;\\tilde p)=\\Gamma(\\tilde p+|\\alpha|)\\prod_{j}\\Gamma(-\\alpha_j)\\left(\\frac{u_j}{2}\\right)^{\\alpha_j}F_C^{(n)}\\!\\left[\\genfrac{}{}{0pt}{0}{\\frac{\\tilde p+|\\alpha|}{2},\\,\\frac{\\tilde p+1+|\\alpha|}{2}}{1+\\alpha_1,\\dots,1+\\alpha_n}\\,\\middle|\\,u_1^2,\\dots,u_n^2\\right]'],
			['Vertex function', '\\mathcal V^{(n)}_{+}(u;p)=\\mathcal C^{(n)}_{+}(p)\\sum_{\\sigma_1,\\dots,\\sigma_n=\\pm1}\\mathcal F^{(n)}_{\\alpha}(u;\\tilde p),\\qquad \\mathcal V_-=\\mathcal V_+^{*}'],
			['Effective twist', '\\hat p_i=\\tilde p_i+\\sum_{j}\\alpha_{ij}\\ \\ (\\text{on-shell legs of } i),\\qquad \\hat p_S=\\sum_{k\\in S}\\hat p_k']
		];
	}

	function copyText(text, btn, label) {
		var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1600); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
		else {
			var ta = document.createElement('textarea');
			ta.value = text; document.body.appendChild(ta); ta.select();
			try { document.execCommand('copy'); done(); } catch (e) {}
			document.body.removeChild(ta);
		}
	}
	fe.copy.addEventListener('click', function () { copyText(full.tex.join('\n\n'), fe.copy, 'Copy all LaTeX'); });

	/* Time-sliced task runner: keeps the page (and the progress bar) responsive while typesetting. */
	function runTasks(tasks, alive, onStep, onDone) {
		var total = tasks.length, done = 0;
		function pump() {
			if (!alive()) return;
			var t0 = performance.now();
			while (done < total && performance.now() - t0 < 24) { tasks[done++](); }
			if (onStep) onStep(done, total);
			if (done < total) setTimeout(pump, 0);
			else if (onDone) onDone();
		}
		pump();
	}

	/* The model is turned into strings up front (cheap), but a colouring is only typeset while its block is
	   open: opening a block fills it, closing it empties it again. Closed blocks therefore contain no DOM at
	   all, which keeps the page short, fast and free of hidden layout. */
	function renderFull(M, token) {
		full.tex = [];
		fe.configs.innerHTML = '';
		fe.result.hidden = false;
		var headTasks = [];

		var masterSrc = CorrFull.masterTex(M);
		full.tex.push('% ' + CorrFull.orderTex(M), masterSrc);
		headTasks.push(function () { tex(fe.master, masterSrc); });

		var conds = [CorrFull.orderTex(M)].concat(CorrFull.conditionTex(M));
		fe.valid.innerHTML = '';
		conds.forEach(function (c, i) {
			var sp = document.createElement('span');
			sp.className = 'ct-cond';
			fe.valid.appendChild(sp);
			headTasks.push(function () { tex(sp, c, false); });
			if (i < conds.length - 1) fe.valid.appendChild(document.createTextNode(', '));
		});

		fe.defs.innerHTML = '';
		defsRows().forEach(function (r) {
			var row = document.createElement('div'), name = document.createElement('div'), m = document.createElement('div');
			row.className = 'ct-def'; name.className = 'ct-def-name'; m.className = 'ct-def-math';
			name.textContent = r[0];
			row.appendChild(name); row.appendChild(m); fe.defs.appendChild(row);
			headTasks.push(function () { tex(m, r[1], true); });
		});
		fe.count.textContent = M.configs.length + ' colourings, ' + CorrFull.termCount(M) +
			' terms. Each block is one colouring (its complex conjugate is added); a block is typeset when you open it.';

		/* what a block contains, as plain data */
		function planFor(c) {
			var plan = [], headTex = CorrFull.configHead(M, c);
			full.tex.push('% colouring ' + CorrFull.configName(M, c), headTex);
			plan.push({ k: 'eq', tex: headTex });
			c.clusters.forEach(function (K) {
				if (K.verts.length === 1) return;
				plan.push({ k: 'title', html: 'Cluster of vertices ' + K.verts.join(', ') + (K.color > 0 ? ' (+)' : ' (−, complex-conjugate of the + expression)') });
				var sumTex = CorrFull.clusterName(K) + '=\\sum_{\\mathcal D\\subseteq\\text{lines}}\\Phi^{(\\mathcal D)}_{' + CorrFull.sub(K.verts) + '}';
				full.tex.push(sumTex);
				plan.push({ k: 'eq', tex: sumTex });
				K.terms.forEach(function (T) {
					var tt = CorrFull.termTex(M, K, T);
					plan.push({ k: 'cap', text: !T.D.length ? 'all lines analytic' : (!T.A.length ? 'all lines on shell' : tt.title) });
					tt.eqs.forEach(function (eq) { full.tex.push(eq); plan.push({ k: 'eq', tex: eq }); });
				});
			});
			return plan;
		}

		var firstTasks = [];
		M.configs.forEach(function (c, i) {
			var det = document.createElement('details');
			det.className = 'earlier-news ct-config';
			var sm = document.createElement('summary');
			sm.appendChild(miniDiagram(c.col));
			var lab = document.createElement('span');
			lab.textContent = 'Colouring ' + CorrFull.configName(M, c);
			sm.appendChild(lab);
			det.appendChild(sm);
			var body = document.createElement('div');
			body.className = 'ct-config-body';
			det.appendChild(body);

			var plan = planFor(c), state = 'empty', gen = 0;

			function tasksFor(my) {
				return plan.map(function (it) {
					return function () {
						if (my !== gen) return;
						var el = document.createElement(it.k === 'eq' ? 'div' : 'p');
						if (it.k === 'eq') { el.className = 'ct-formula ct-eq'; body.appendChild(el); tex(el, it.tex); return; }
						el.className = it.k === 'title' ? 'ct-cluster-title' : 'ct-term-title';
						if (it.k === 'title') el.innerHTML = it.html; else el.textContent = it.text;
						body.appendChild(el);
					};
				});
			}
			function fill() {
				if (state !== 'empty') return;
				state = 'filling';
				var my = ++gen;
				body.textContent = '';
				runTasks(tasksFor(my), function () { return my === gen && token === full.token; }, null, function () { state = 'full'; });
			}
			function empty() {
				gen++; state = 'empty';
				body.textContent = '';
			}
			det.addEventListener('toggle', function () { if (det.open) fill(); else empty(); });

			if (i === 0) {
				/* the first block starts open and is typeset together with the header, under the progress bar */
				det.open = true; state = 'filling';
				var my0 = ++gen;
				firstTasks = tasksFor(my0);
				det._firstDone = function () { if (my0 === gen) state = 'full'; };
				fe._first = det;
			}
			fe.configs.appendChild(det);
		});

		var tasks = headTasks.concat(firstTasks);
		function label(done, total) { return 'Typesetting ' + done + ' of ' + total + ' equations · ' + Math.round(100 * done / total) + '%'; }
		setProgress(0, label(0, tasks.length));
		runTasks(tasks, function () { return token === full.token; },
			function (done, total) { if (done < total) setProgress(done / total, label(done, total)); },
			function () {
				if (fe._first && fe._first._firstDone) fe._first._firstDone();
				setProgress(1, 'Done');
				fe.note.textContent = 'Done.';
				full.busy = false; fe.run.disabled = false;
				setTimeout(function () { if (token === full.token) setProgress(null); }, 900);
			});
	}

	fe.run.addEventListener('click', function () {
		if (full.busy) return;
		var g = graphNow();
		var A = g.V ? CorrCore.analyze(g.V, g.edges, g.root) : { ok: false };
		if (!A.ok || g.V > MAXV_FULL) return;
		full.busy = true; fe.run.disabled = true;
		fe.note.textContent = '';
		var token = ++full.token;
		setProgress(0, 'Preparing terms…');
		setTimeout(function () {
			var M = CorrFull.build(g.V, g.edges, full.order.slice());
			renderFull(M, token);
		}, 30);
	});

	window.addEventListener('resize', draw);

	setTool('move');
	load('three');
})();
