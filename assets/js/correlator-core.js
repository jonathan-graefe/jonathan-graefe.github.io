/* Maximally-nested spectral gluing for tree-level massive cosmological correlators.
   Implements the algorithm of Gräfe & Werth, arXiv:2607.18223, Sec. 4.2:
     rooted tree -> incidence matrix Q -> path matrix P_r = Q_r^{-1} -> on-shell x* -> series.
   This file is pure logic (no DOM) so that it can also be run under Node for testing. */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.CorrCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {

	/* ---- label helpers: digits are glued (p_{345}); labels >= 10 are comma separated ---- */
	function sub(list) {
		var a = list.slice().sort(function (x, y) { return x - y; });
		return a.every(function (x) { return x < 10; }) ? a.join('') : a.join(',');
	}
	function pair(a, b) { return sub([a, b]); }
	function dirPair(i, j) { return (i < 10 && j < 10) ? '' + i + j : i + ',' + j; }   /* ordered: u_{ij} = Y_ij / X_i */

	/* ---- tree analysis ---- */
	function analyze(V, edgeList, rootLabel) {
		if (V < 1) return { ok: false, error: 'Add at least one vertex.' };
		var edges = edgeList.map(function (e) { return [Math.min(e[0], e[1]), Math.max(e[0], e[1])]; })
			.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
		var adj = {}, i;
		for (i = 1; i <= V; i++) adj[i] = [];
		edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
		Object.keys(adj).forEach(function (k) { adj[k].sort(function (a, b) { return a - b; }); });

		/* connected components */
		var seen = {}, comps = 0;
		for (i = 1; i <= V; i++) {
			if (seen[i]) continue;
			comps++;
			var st = [i]; seen[i] = true;
			while (st.length) {
				var v = st.pop();
				adj[v].forEach(function (w) { if (!seen[w]) { seen[w] = true; st.push(w); } });
			}
		}
		if (comps > 1) return { ok: false, error: 'The graph is not connected yet (' + comps + ' pieces). Join all vertices with edges.' };
		if (edges.length !== V - 1) return { ok: false, error: 'The graph contains a loop; only tree graphs are supported.' };

		var r = rootLabel;
		var parent = {}, order = [r], children = {};
		for (i = 1; i <= V; i++) children[i] = [];
		parent[r] = 0;
		for (var q = 0; q < order.length; q++) {
			var u = order[q];
			adj[u].forEach(function (w) {
				if (parent[w] === undefined) { parent[w] = u; children[u].push(w); order.push(w); }
			});
		}
		/* subtree vertex sets S_i (i together with all its descendants) */
		var S = {};
		for (i = 1; i <= V; i++) S[i] = [i];
		for (var k = order.length - 1; k > 0; k--) {
			var c = order[k];
			S[parent[c]] = S[parent[c]].concat(S[c]);
		}
		var nonRoot = [];
		for (i = 1; i <= V; i++) if (i !== r) nonRoot.push(i);

		/* incidence matrix Q (V x I): -1 where the edge leaves a vertex, +1 where it arrives */
		var Qm = [];
		for (i = 0; i < V; i++) Qm.push(edges.map(function () { return 0; }));
		var edgeInfo = edges.map(function (e, j) {
			var p = parent[e[0]] === e[1] ? e[1] : e[0];
			var ch = p === e[0] ? e[1] : e[0];
			Qm[p - 1][j] = -1;
			Qm[ch - 1][j] = +1;
			return { a: e[0], b: e[1], parent: p, child: ch };
		});
		/* reduced incidence matrix: delete the root row */
		var Qr = Qm.filter(function (row, idx) { return idx !== r - 1; });
		/* path matrix: P[j][col] = 1 if edge j lies on the path root -> nonRoot[col] */
		var P = edges.map(function (e, j) {
			return nonRoot.map(function (v) { return S[edgeInfo[j].child].indexOf(v) >= 0 ? 1 : 0; });
		});

		return {
			ok: true, V: V, I: edges.length, root: r, edges: edgeInfo, adj: adj,
			parent: parent, children: children, subtree: S, order: order, nonRoot: nonRoot,
			Q: Qm, Qr: Qr, P: P
		};
	}

	/* integer matrix product (for the self-check Q_r P_r = 1) */
	function matMul(A, B) {
		return A.map(function (row) {
			return B[0].map(function (_, c) { return row.reduce(function (s, v, k) { return s + v * B[k][c]; }, 0); });
		});
	}

	/* ---- LaTeX ---- */
	function ptil(set) { return '\\tilde p_{' + sub(set) + '}'; }
	function mm(set) { return 'm_{' + sub(set) + '}'; }

	function lauricella(n, upper, lower, args) {
		if (n === 0) return '';
		return 'F_C^{(' + n + ')}\\left[\\genfrac{}{}{0pt}{0}{' + upper.join(',\\,') + '}{' +
			lower.join(',\\,') + '}\\,\\middle|\\,' + args.join(',\\,') + '\\right]';
	}

	function matrixLatex(M, rowLabels, colLabels) {
		var cols = 'r|' + colLabels.map(function () { return 'r'; }).join('');
		var s = '\\begin{array}{' + cols + '} & ' + colLabels.join(' & ') + '\\\\ \\hline ';
		s += M.map(function (row, i) {
			return rowLabels[i] + ' & ' + row.map(function (v) { return v > 0 ? '+' + v : '' + v; }).join(' & ');
		}).join('\\\\ ');
		return s + '\\end{array}';
	}

	function build(A) {
		var V = A.V, I = A.I, r = A.root, all = [], i;
		for (i = 1; i <= V; i++) all.push(i);
		var ptot = ptil(all);
		var nr = A.nonRoot;
		var mAll = nr.length ? 'm_{' + sub(nr) + '}' : '0';          /* |m| = sum of the summation indices */

		/* ---- overall coefficient ---- */
		var coefficient = (I > 0 ? '\\left(-\\frac{4i}{\\pi}\\right)' + (I > 1 ? '^{' + I + '}' : '') : '') +
			'e^{-\\frac{i\\pi}{2}\\,' + ptot + '}';

		/* ---- vertex by vertex ---- */
		var lines = [];
		var uArg = function (v, w) { return 'u_{' + dirPair(v, w) + '}^2'; };

		/* root vertex */
		var rootLower = [], rootArgs = [];
		A.adj[r].forEach(function (w) {
			rootLower.push('1+' + ptil(A.subtree[w]) + '+' + mm(A.subtree[w]));
			rootArgs.push(uArg(r, w));
		});
		var rootF = lauricella(A.adj[r].length, [
			'\\frac{' + ptot + '+' + mAll + '}{2}',
			'\\frac{' + ptot + '+1+' + mAll + '}{2}'
		], rootLower, rootArgs);
		lines.push({ vertex: r, tex: rootF });

		/* non-root vertices */
		nr.forEach(function (v) {
			var par = A.parent[v], Sv = A.subtree[v];
			var lower = [], args = [];
			A.adj[v].forEach(function (w) {
				if (w === par) lower.push('1-' + ptil(Sv) + '-' + mm(Sv));
				else lower.push('1+' + ptil(A.subtree[w]) + '+' + mm(A.subtree[w]));
				args.push(uArg(v, w));
			});
			var F = lauricella(A.adj[v].length, ['-\\frac{m_{' + v + '}}{2}', '\\frac{1-m_{' + v + '}}{2}'], lower, args);
			var pref = '\\frac{\\left(X_{' + v + '}/X_{' + r + '}\\right)^{\\tilde p_{' + v + '}+m_{' + v + '}}}' +
				'{\\left(' + ptil(Sv) + '+' + mm(Sv) + '\\right)^2+\\mu_{' + pair(par, v) + '}^2}';
			lines.push({ vertex: v, tex: pref + '\\,' + F });
		});

		/* ---- the full formula ---- */
		var sumPart = '', facPart = '';
		if (nr.length) {
			var idxs = nr.map(function (v) { return 'm_{' + v + '}'; });
			sumPart = nr.length <= 4 ? '\\sum_{' + idxs.join(',') + '=0}^{\\infty}' : '\\sum_{m_i=0,\\ i\\neq ' + r + '}^{\\infty}';
			facPart = nr.length <= 4
				? '\\frac{(-1)^{' + mAll + '}}{' + idxs.map(function (s) { return s + '!'; }).join('\\,') + '}'
				: '\\prod_{i\\neq ' + r + '}\\frac{(-1)^{m_i}}{m_i!}';
		}
		var head = '\\widehat{\\mathcal I}^{\\mathcal P}_{\\mathcal G_{' + r + '}} &= C\\;' + sumPart + facPart +
			'\\;\\Gamma\\!\\left(' + ptot + '+' + mAll + '\\right)';
		var body = lines.map(function (l, idx) {
			return '&\\quad\\times\\; ' + l.tex;
		}).join('\\\\[0.6em] ');
		var formula = '\\begin{aligned}' + head + (body ? '\\\\[0.6em] ' + body : '') + '\\end{aligned}';
		if (I === 0) formula = '\\widehat{\\mathcal I}_{+} = C\\,\\Gamma\\!\\left(' + ptot + '\\right)';

		/* ---- definitions ---- */
		var degrees = all.map(function (v) { return 'n_{' + v + '}=' + A.adj[v].length; });

		/* ---- intermediate steps ---- */
		var edgeNames = A.edges.map(function (e) { return 'x_{' + pair(e.a, e.b) + '}'; });
		var rowLab = all.map(function (v) { return '(' + v + ')'; });
		var Qtex = I > 0 ? matrixLatex(A.Q, rowLab, edgeNames) : '';
		var QrTex = I > 0 ? matrixLatex(A.Qr, nr.map(function (v) { return '(' + v + ')'; }), edgeNames) : '';
		var PTex = I > 0 ? matrixLatex(A.P, edgeNames, nr.map(function (v) { return '(' + v + ')'; })) : '';
		var xs = A.edges.map(function (e) {
			var Sc = A.subtree[e.child];
			return 'x^{\\ast}_{' + pair(e.a, e.b) + '} &= -\\left(' + ptil(Sc) + '+' + mm(Sc) + '\\right)';
		}).join('\\\\ ');
		var region = nr.length ? nr.map(function (v) { return 'X_{' + v + '}'; }).join('+') + ' < X_{' + r + '}' : '';

		return {
			formula: formula,
			coefficient: coefficient,
			degrees: degrees,
			Q: Qtex, Qr: QrTex, P: PTex,
			xstar: I > 0 ? '\\begin{aligned}' + xs + '\\end{aligned}' : '',
			region: region,
			mTotal: mAll
		};
	}

	return { analyze: analyze, build: build, matMul: matMul, sub: sub };
});
