/* Full tree-level massive correlator: sum over all Schwinger-Keldysh colourings, with the
   on-shell and the analytic poles of every time-ordered line (spectral gluing, arXiv:2607.18223,
   Secs. 4.1, 4.3, 4.4 and App. B).

   For every colouring the same-colour lines split the tree into monochrome clusters.  In a cluster each
   line is either set on shell (delta part of the spectral density) or analytic (principal-value part):
     * an on-shell line is cut; the end with the larger energy carries the Boltzmann-weighted frequency
       modes e^{+-pi mu}, the other end the full vertex function, and it contributes a factor -1;
     * the analytic lines glue the vertices into pieces that are evaluated with the maximally nested
       algorithm (rooted at the piece's highest-energy vertex); all cut lines enter as frozen massive legs.
   The model built here is pure data (it is also used by the numerical tests). */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.CorrFull = factory();
})(typeof self !== 'undefined' ? self : this, function () {

	/* ---------------- small helpers ---------------- */
	function sortNum(a) { return a.slice().sort(function (x, y) { return x - y; }); }
	function sub(list) {
		var a = sortNum(list);
		return a.every(function (x) { return x < 10; }) ? a.join('') : a.join(',');
	}
	function pair(a, b) { return sub([a, b]); }
	function dir(i, j) { return (i < 10 && j < 10) ? '' + i + j : i + ',' + j; }
	function range(n) { var r = []; for (var i = 1; i <= n; i++) r.push(i); return r; }

	function components(vertices, edges) {
		var par = {};
		vertices.forEach(function (v) { par[v] = v; });
		function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
		edges.forEach(function (e) { par[find(e[0])] = find(e[1]); });
		var g = {}, out = [];
		vertices.forEach(function (v) {
			var r = find(v);
			if (!g[r]) { g[r] = []; out.push(g[r]); }
			g[r].push(v);
		});
		return out.map(sortNum);
	}

	/* default energy ordering: breadth-first from the root (parents before children) */
	function defaultOrder(V, edgeList, rootV) {
		var adj = {}, i;
		for (i = 1; i <= V; i++) adj[i] = [];
		edgeList.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
		var order = [rootV], seen = {};
		seen[rootV] = true;
		for (var q = 0; q < order.length; q++) {
			sortNum(adj[order[q]]).forEach(function (w) { if (!seen[w]) { seen[w] = true; order.push(w); } });
		}
		for (i = 1; i <= V; i++) if (!seen[i]) order.push(i);
		return order;
	}

	/* ---------------- linear forms (parameters of Gamma and F_C) ----------------
	   {h: bool, t: [{c, k, S|v,w}]} with k in one | phat(S) | alpha(v,w) | m(S) ; value is sum c*val, halved if h */
	function lin(h) {
		var t = [];
		for (var i = 1; i < arguments.length; i++) {
			var a = arguments[i];
			t.push({ c: a[0], k: a[1], S: a[2], v: a[2], w: a[3] });
		}
		t.forEach(function (x) {
			if (x.k === 'phat' || x.k === 'm') { delete x.v; delete x.w; x.S = sortNum(x.S); }
			else if (x.k === 'alpha') delete x.S;
			else { delete x.S; delete x.v; delete x.w; }
		});
		return { h: !!h, t: t };
	}

	/* ---------------- model ---------------- */
	function build(V, edgeList, order) {
		var rank = {};
		order.forEach(function (v, i) { rank[v] = i; });
		var edges = edgeList.map(function (e) { return [Math.min(e[0], e[1]), Math.max(e[0], e[1])]; })
			.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
		var adj = {};
		range(V).forEach(function (v) { adj[v] = []; });
		edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
		range(V).forEach(function (v) { adj[v] = sortNum(adj[v]); });
		var ctx = { V: V, edges: edges, adj: adj, rank: rank, order: order };

		var top = order[0], configs = [];
		for (var mask = 0; mask < (1 << V); mask++) {
			var col = {};
			range(V).forEach(function (v) { col[v] = ((mask >> (v - 1)) & 1) ? -1 : 1; });
			if (col[top] !== 1) continue;
			configs.push(buildConfig(ctx, col));
		}

		/* sufficient convergence conditions from the soft limit, one per analytic piece */
		var cond = {}, condList = [];
		configs.forEach(function (c) {
			c.clusters.forEach(function (K) {
				K.terms.forEach(function (T) {
					T.comps.forEach(function (Lam) {
						if (Lam.verts.length < 2) return;
						var key = Lam.root + ':' + Lam.verts.join(',');
						if (cond[key]) return;
						cond[key] = true;
						condList.push({ root: Lam.root, others: Lam.verts.filter(function (v) { return v !== Lam.root; }) });
					});
				});
			});
		});
		/* drop a condition that is implied by a stronger one with the same root (its sum contains a subset) */
		condList = condList.filter(function (c) {
			return !condList.some(function (o) {
				return o !== c && o.root === c.root && o.others.length > c.others.length &&
					c.others.every(function (v) { return o.others.indexOf(v) >= 0; });
			});
		});
		condList.sort(function (a, b) { return b.others.length - a.others.length || a.root - b.root; });

		return { V: V, edges: edges, order: order, deg: range(V).map(function (v) { return adj[v].length; }), configs: configs, conditions: condList };
	}

	function buildConfig(ctx, col) {
		var V = ctx.V;
		var same = ctx.edges.filter(function (e) { return col[e[0]] === col[e[1]]; });
		var diff = ctx.edges.filter(function (e) { return col[e[0]] !== col[e[1]]; });
		var minus = range(V).filter(function (v) { return col[v] === -1; }).length;
		/* prefactor prod_j (i a_j) = i^V (-1)^{#minus} */
		var ip = [[1, 0], [0, 1], [-1, 0], [0, -1]][V % 4];
		var sgn = (minus % 2) ? -1 : 1;
		var pref = { re: ip[0] * sgn, im: ip[1] * sgn };

		var clusters = components(range(V), same).map(function (Kv) {
			var Ke = same.filter(function (e) { return Kv.indexOf(e[0]) >= 0; });
			var ext = [];
			Kv.forEach(function (v) {
				ctx.adj[v].forEach(function (w) {
					if (col[w] !== col[v]) ext.push({ v: v, w: w });
				});
			});
			var cl = { verts: Kv, color: col[Kv[0]], edges: Ke, ext: ext, terms: [] };
			for (var dm = 0; dm < (1 << Ke.length); dm++) cl.terms.push(buildTerm(ctx, cl, dm));
			return cl;
		});
		return { col: col, pref: pref, clusters: clusters };
	}

	function buildTerm(ctx, K, dmask) {
		var D = [], A = [];
		K.edges.forEach(function (e, i) { ((dmask >> i) & 1 ? D : A).push(e); });
		var legs = [];
		K.ext.forEach(function (l) { legs.push({ v: l.v, w: l.w, weighted: false, on: false }); });
		D.forEach(function (e) {
			var p = ctx.rank[e[0]] < ctx.rank[e[1]] ? e[0] : e[1];
			var c = p === e[0] ? e[1] : e[0];
			legs.push({ v: p, w: c, weighted: true, on: true });
			legs.push({ v: c, w: p, weighted: false, on: true });
		});
		var comps = components(K.verts, A).map(function (Lam) { return buildComp(ctx, Lam, A, legs); });
		return { D: D, A: A, sign: (D.length % 2) ? -1 : 1, legs: legs, comps: comps };
	}

	function buildComp(ctx, Lam, Aall, legsAll) {
		var Ae = Aall.filter(function (e) { return Lam.indexOf(e[0]) >= 0; });
		var rootV = Lam.slice().sort(function (a, b) { return ctx.rank[a] - ctx.rank[b]; })[0];
		var adj = {};
		Lam.forEach(function (v) { adj[v] = []; });
		Ae.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
		Lam.forEach(function (v) { adj[v] = sortNum(adj[v]); });
		var parent = {}, order = [rootV], children = {};
		Lam.forEach(function (v) { children[v] = []; });
		parent[rootV] = 0;
		for (var q = 0; q < order.length; q++) {
			adj[order[q]].forEach(function (w) {
				if (parent[w] === undefined) { parent[w] = order[q]; children[order[q]].push(w); order.push(w); }
			});
		}
		var subtree = {};
		Lam.forEach(function (v) { subtree[v] = [v]; });
		for (var k = order.length - 1; k > 0; k--) {
			var c = order[k];
			subtree[parent[c]] = subtree[parent[c]].concat(subtree[c]);
		}
		var nonRoot = Lam.filter(function (v) { return v !== rootV; });
		var legs = legsAll.filter(function (l) { return Lam.indexOf(l.v) >= 0; });

		var rows = {};
		Lam.forEach(function (v) {
			var lowers = [], args = [];
			adj[v].forEach(function (w) {
				if (w === parent[v]) lowers.push(lin(false, [1, 'one'], [-1, 'phat', subtree[v]], [-1, 'm', subtree[v]]));
				else lowers.push(lin(false, [1, 'one'], [1, 'phat', subtree[w]], [1, 'm', subtree[w]]));
				args.push([v, w]);
			});
			legs.filter(function (l) { return l.v === v; }).forEach(function (l) {
				lowers.push(lin(false, [1, 'one'], [1, 'alpha', l.v, l.w]));
				args.push([l.v, l.w]);
			});
			var upper;
			if (v === rootV) {
				var tot = [[1, 'phat', Lam]].concat(nonRoot.length ? [[1, 'm', nonRoot]] : []);
				upper = [lin.apply(null, [true].concat(tot)), lin.apply(null, [true, [1, 'one']].concat(tot))];
			} else {
				upper = [lin(true, [-1, 'm', [v]]), lin(true, [1, 'one'], [-1, 'm', [v]])];
			}
			rows[v] = { upper: upper, lower: lowers, args: args };
		});
		var props = {};
		nonRoot.forEach(function (v) {
			props[v] = {
				par: parent[v],
				pow: lin(false, [1, 'phat', [v]], [1, 'm', [v]]),
				den: lin(false, [1, 'phat', subtree[v]], [1, 'm', subtree[v]])
			};
		});
		var gam = lin.apply(null, [false, [1, 'phat', Lam]].concat(nonRoot.length ? [[1, 'm', nonRoot]] : []));
		return {
			verts: Lam, root: rootV, edges: Ae, parent: parent, children: children, subtree: subtree,
			nonRoot: nonRoot, legs: legs, rows: rows, props: props, gamma: gam, nA: Ae.length
		};
	}

	/* =====================================================================
	   LaTeX
	   ===================================================================== */
	function linTex(l, hatSet) {
		var rankOf = { one: 0, phat: 1, alpha: 2, m: 3 };
		var ts = l.t.slice().sort(function (a, b) { return rankOf[a.k] - rankOf[b.k]; });
		var out = '';
		ts.forEach(function (x, i) {
			var body;
			if (x.k === 'one') body = '1';
			else if (x.k === 'phat') {
				var hat = x.S.some(function (v) { return hatSet[v]; });
				body = (hat ? '\\hat p_{' : '\\tilde p_{') + sub(x.S) + '}';
			} else if (x.k === 'alpha') body = '\\alpha_{' + dir(x.v, x.w) + '}';
			else body = 'm_{' + sub(x.S) + '}';
			var neg = x.c < 0;
			out += (i === 0 ? (neg ? '-' : '') : (neg ? '-' : '+')) + body;
		});
		return l.h ? '\\frac{' + out + '}{2}' : out;
	}

	function fcTex(n, upper, lower, args, hatSet) {
		if (n === 0) return '';
		return 'F_C^{(' + n + ')}\\left[\\genfrac{}{}{0pt}{0}{' + upper.map(function (l) { return linTex(l, hatSet); }).join(',\\,') + '}{' +
			lower.map(function (l) { return linTex(l, hatSet); }).join(',\\,') + '}\\,\\middle|\\,' +
			args.map(function (a) { return 'u_{' + dir(a[0], a[1]) + '}^2'; }).join(',\\,') + '\\right]';
	}

	function legPref(l) {
		return '\\Gamma(-\\alpha_{' + dir(l.v, l.w) + '})\\left(\\frac{u_{' + dir(l.v, l.w) + '}}{2}\\right)^{\\alpha_{' + dir(l.v, l.w) + '}}';
	}

	function cTex(n, v) { return '\\mathcal C^{(' + n + ')}_+(p_{' + v + '})'; }

	/* a single vertex piece: C F_alpha (notation of the paper) */
	function singleTex(M, Lam) {
		var v = Lam.verts[0], n = M.deg[v - 1];
		if (n === 0) return cTex(0, v) + '\\,\\Gamma(\\tilde p_{' + v + '})';
		var al = Lam.legs.map(function (l) { return '\\alpha_{' + dir(l.v, l.w) + '}'; }).join(',');
		var us = Lam.legs.map(function (l) { return 'u_{' + dir(l.v, l.w) + '}'; }).join(',');
		return cTex(n, v) + '\\,\\mathcal F^{(' + n + ')}_{' + al + '}\\!\\left(' + us + ';\\tilde p_{' + v + '}\\right)';
	}

	/* a multi-vertex piece: explicit nested series, as a list of aligned lines */
	function nestedLines(M, Lam, hatSet) {
		var R = Lam.root, nr = Lam.nonRoot;
		var coef = '(4\\pi i)' + (Lam.nA > 1 ? '^{' + Lam.nA + '}' : '') + '\\,' + Lam.verts.map(function (v) { return cTex(M.deg[v - 1], v); }).join('\\,');
		var legs = Lam.legs.map(legPref).join('\\,');
		var idx = nr.map(function (v) { return 'm_{' + v + '}'; });
		var sum = nr.length <= 4 ? '\\sum_{' + idx.join(',') + '=0}^{\\infty}' : '\\sum_{m_i=0,\\,i\\neq ' + R + '}^{\\infty}';
		var mAll = 'm_{' + sub(nr) + '}';
		var fac = nr.length <= 4
			? '\\frac{(-1)^{' + mAll + '}}{' + idx.map(function (s) { return s + '!'; }).join('\\,') + '}'
			: '\\prod_{i\\neq ' + R + '}\\frac{(-1)^{m_i}}{m_i!}';
		var lines = [];
		lines.push(coef + (legs ? '\\,' + legs : '') + '\\;' + sum + fac + '\\,\\Gamma\\!\\left(' + linTex(Lam.gamma, hatSet) + '\\right)');
		/* root vertex, then the others */
		var verts = [R].concat(nr);
		verts.forEach(function (v) {
			var row = Lam.rows[v], deg = row.args.length;
			var F = fcTex(deg, row.upper, row.lower, row.args, hatSet);
			if (v === R) lines.push(F);
			else {
				var pr = Lam.props[v];
				lines.push('\\frac{\\left(X_{' + v + '}/X_{' + R + '}\\right)^{' + linTex(pr.pow, hatSet) + '}}' +
					'{\\left(' + linTex(pr.den, hatSet) + '\\right)^2+\\mu_{' + pair(pr.par, v) + '}^2}\\,' + F);
			}
		});
		return lines;
	}

	function sigmaSum(legs) {
		var names = legs.map(function (l) { return '\\sigma_{' + dir(l.v, l.w) + '}'; });
		if (!names.length) return '';
		return '\\sum_{' + (names.length <= 4 ? names.join(',') : '\\{\\sigma_l\\}') + '=\\pm1}\\,';
	}

	function weightTex(legs) {
		var w = legs.filter(function (l) { return l.weighted; });
		if (!w.length) return '';
		var ex = w.map(function (l, i) { return (i ? '+' : '') + '\\sigma_{' + dir(l.v, l.w) + '}\\mu_{' + pair(l.v, l.w) + '}'; }).join('');
		return 'e^{\\pi' + (w.length > 1 ? '(' + ex + ')' : ex) + '}\\,';
	}

	function vertexFnTex(M, v, color, legs) {
		var n = M.deg[v - 1];
		var sgn = color > 0 ? '+' : '-';
		if (n === 0) return '\\mathcal V^{(0)}_{' + sgn + '}(\\,;p_{' + v + '})';
		return '\\mathcal V^{(' + n + ')}_{' + sgn + '}\\!\\left(' + legs.map(function (l) { return 'u_{' + dir(l.v, l.w) + '}'; }).join(',') + ';p_{' + v + '}\\right)';
	}

	function clusterName(K) { return '\\Phi_{' + sub(K.verts) + '}'; }

	/* One term of a cluster: returns {title, tex[]} (display equations) */
	function termTex(M, K, T) {
		var hatSet = {};
		T.legs.forEach(function (l) { hatSet[l.v] = true; });
		var head = '\\Phi^{(' + (T.D.length ? T.D.map(function (e) { return pair(e[0], e[1]); }).join(',') : '\\varnothing') + ')}_{' + sub(K.verts) + '}';
		var multi = T.comps.filter(function (L) { return L.verts.length > 1; });
		var pieces = T.comps.map(function (L) {
			return L.verts.length === 1 ? '\\Big[' + singleTex(M, L) + '\\Big]' : '\\mathcal G_{' + sub(L.verts) + '}';
		});
		var first = head + '=' + (T.sign < 0 ? '-' : '') + sigmaSum(T.legs) + weightTex(T.legs) + pieces.join('\\;');
		var eqs = [first];
		multi.forEach(function (L) {
			var ln = nestedLines(M, L, hatSet);
			var s = '\\mathcal G_{' + sub(L.verts) + '}=' + ln.map(function (x, i) { return (i ? '\\times\\;' : '') + x; }).join('\\\\[0.5em] &\\quad ');
			eqs.push('\\begin{aligned}' + s.replace('=', '&=') + '\\end{aligned}');
		});
		var parts = [];
		if (T.D.length) parts.push('on shell: ' + T.D.map(function (e) { return '(' + e[0] + ',' + e[1] + ')'; }).join(' '));
		if (T.A.length) parts.push('analytic: ' + T.A.map(function (e) { return '(' + e[0] + ',' + e[1] + ')'; }).join(' '));
		return { title: parts.join(' · '), eqs: eqs };
	}

	function configName(M, c) {
		return '(' + range(M.V).map(function (v) { return c.col[v] > 0 ? '+' : '-'; }).join(',') + ')';
	}

	function prefTex(p) {
		if (p.im === 0) return p.re < 0 ? '-1' : '1';
		return p.im < 0 ? '-i' : 'i';
	}

	/* the line T_a = ... for one colouring */
	function configHead(M, c) {
		var factors = c.clusters.map(function (K) {
			if (K.verts.length === 1) {
				var v = K.verts[0];
				return vertexFnTex(M, v, K.color, K.ext);
			}
			return clusterName(K) + (K.color < 0 ? '^{*}' : '');
		});
		var p = prefTex(c.pref);
		return 'T_{' + range(M.V).map(function (v) { return c.col[v] > 0 ? '+' : '-'; }).join('') + '}=' + (p === '1' ? '' : (p === '-1' ? '-' : p + '\\,')) + factors.join('\\;');
	}

	function masterTex(M) {
		return '\\widehat{\\mathcal G}=\\sum_{a:\\;a_{' + M.order[0] + '}=+}\\left(T_a+T_a^{*}\\right),\\qquad ' +
			'T_a=\\prod_j(i a_j)\\,\\widehat{\\mathcal I}_a';
	}

	function conditionTex(M) {
		/* a condition with a single other vertex is just the ordering X_other < X_root, already part of the chain */
		return M.conditions.filter(function (c) { return c.others.length > 1; }).map(function (c) {
			return c.others.map(function (v) { return 'X_{' + v + '}'; }).join('+') + '<X_{' + c.root + '}';
		});
	}

	function orderTex(M) {
		return M.order.map(function (v) { return 'X_{' + v + '}'; }).join('>');
	}

	/* total number of explicit terms (for size warnings) */
	function termCount(M) {
		var n = 0;
		M.configs.forEach(function (c) { c.clusters.forEach(function (K) { n += K.terms.length; }); });
		return n;
	}

	return {
		build: build, defaultOrder: defaultOrder, termTex: termTex, configName: configName, configHead: configHead,
		masterTex: masterTex, conditionTex: conditionTex, orderTex: orderTex, termCount: termCount,
		clusterName: clusterName, linTex: linTex, sub: sub
	};
});
