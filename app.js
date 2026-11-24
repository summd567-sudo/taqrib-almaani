(() => {
  'use strict';
  const V = window.SHATIBIYYAH || [];
  const $ = (id) => document.getElementById(id);
  const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
  const MAX_RESULTS = 150;
  // Commentaries linked to the matn: `id` is the page field on each verse.
  const BOOKS = [
    { id: 'p', name: 'تقريب المعاني', short: 'التقريب', store: 'pdf' },
    { id: 'w', name: 'الوافي في شرح الشاطبية', short: 'الوافي', store: 'pdf-w' },
  ].filter((b) => (window.SHATIBIYYAH || []).some((v) => v[b.id]));
  const book = (id) => BOOKS.find((b) => b.id === id) || BOOKS[0];

  // ---------- normalisation ----------
  const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  const norm = (s) => s
    .replace(DIAC, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^ء-ي0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const CLASS = { 'ا': '[اأإآٱ]', 'ي': '[يىئ]', 'ه': '[هة]', 'و': '[وؤ]' };
  const D = '[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*';
  const tokenRe = (tok) => [...tok].map((c) => (CLASS[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + D).join('');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const highlight = (text, re) => {
    if (!re) return esc(text);
    let out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  };

  // ---------- index ----------
  const sections = [];
  V.forEach((v, i) => {
    const last = sections[sections.length - 1];
    if (!last || last.name !== v.s) sections.push({ name: v.s, start: i, norm: norm(v.s) });
    v.i = i;
    v.sec = sections.length - 1;
    v.k = i - sections[sections.length - 1].start + 1;
    v.h = norm(v.a + ' ' + v.b);
  });
  // Quranic phrases quoted in the commentary, per page: [page, phrase]
  const QW = window.QWORDS || [];
  const byPage = new Map();
  V.forEach((v) => { if (!byPage.has(v.p)) byPage.set(v.p, []); byPage.get(v.p).push(v); });
  const versesNear = (p) => { for (let x = p; x > 0; x--) if (byPage.has(x)) return byPage.get(x); return []; };

  // ---------- rendering ----------
  const list = $('list'), status = $('status'), q = $('q');
  const row = (v, re, withContext) => `
    <div class="v" id="b${v.n}">
      <span class="num" title="رقم البيت في المنظومة">${ar(v.n)}</span>
      <div class="txt"><span>${highlight(v.a, re)}</span><span>${highlight(v.b, re)}</span></div>
      <div class="pgs">${BOOKS.filter((b) => v[b.id]).map((b) =>
        `<button class="pg" type="button" data-b="${b.id}" data-p="${v[b.id]}" title="افتح صفحة الشرح في ${b.name}"><small>${b.short}</small> ص ${ar(v[b.id])}</button>`).join('')}</div>
      <div class="meta">${withContext
        ? `${esc(v.s)} · البيت ${ar(v.k)} · <a href="#b=${v.n}" data-go="${v.n}">موضعه في المتن</a>`
        : `البيت ${ar(v.k)} في الباب`}</div>
    </div>`;

  let fullHtml = null;
  const renderAll = () => {
    if (!fullHtml) {
      fullHtml = sections.map((s, si) => {
        const end = si + 1 < sections.length ? sections[si + 1].start : V.length;
        return `<h2 class="sec" id="s${si}">${esc(s.name)}</h2>` + V.slice(s.start, end).map((v) => row(v, null, false)).join('');
      }).join('');
    }
    list.innerHTML = fullHtml;
    status.textContent = `${ar(V.length)} بيتًا · اضغط رقم الصفحة بجوار أي بيت لفتح شرحه في الكتاب`;
  };

  const search = (raw) => {
    const nq = norm(raw);
    if (!nq) return null;
    const toks = nq.split(' ');
    const res = [];
    const num = /^\d+$/.test(nq) ? Number(nq) : null;
    for (const v of V) {
      let sc = 0;
      if (num !== null) {
        if (v.n === num) sc = 100; else if (BOOKS.some((b) => v[b.id] === num)) sc = 50; else if (v.k === num) sc = 5;
      } else if (toks.every((t) => v.h.includes(t))) {
        sc = 1;
        if (v.h.includes(nq)) sc += 10;
        if ((' ' + v.h + ' ').includes(' ' + nq + ' ')) sc += 5;
        sc += toks.filter((t) => (' ' + v.h).includes(' ' + t)).length;
      }
      if (sc) res.push({ v, sc });
    }
    res.sort((x, y) => y.sc - x.sc || x.v.i - y.v.i);
    const secs = num === null ? sections.map((s, si) => ({ s, si })).filter(({ s }) => toks.every((t) => s.norm.includes(t))) : [];
    const re = num === null ? new RegExp(toks.map(tokenRe).sort((a, b) => b.length - a.length).join('|'), 'g') : null;
    const pages = new Map();
    if (num === null) {
      for (const [p, ph] of QW) {
        if (!toks.every((t) => ph.includes(t))) continue;
        if (!pages.has(p)) pages.set(p, []);
        pages.get(p).push(ph);
      }
    }
    return { res, secs, re, num, pages: [...pages].sort((x, y) => x[0] - y[0]) };
  };

  const renderSearch = (raw) => {
    const r = search(raw);
    if (!r) { renderAll(); return; }
    const shown = r.res.slice(0, MAX_RESULTS);
    let html = '';
    if (r.secs.length) {
      html += '<div class="chips">' + r.secs.slice(0, 12).map(({ s, si }) =>
        `<button class="chip" type="button" data-sec="${si}">${esc(s.name)}</button>`).join('') + '</div>';
    }
    html += shown.map(({ v }) => row(v, r.re, true)).join('');
    if (r.pages.length) {
      html += `<h2 class="sec">كلمات قرآنية في الشرح</h2>` + r.pages.slice(0, MAX_RESULTS).map(([p, phs]) => {
        const vs = versesNear(p), v0 = vs[0];
        return `<div class="v qp">
          <span class="num">﴿﴾</span>
          <div class="txt one"><span>${phs.map((ph) => highlight(ph, r.re)).join(' · ')}</span></div>
          <div class="pgs"><button class="pg" type="button" data-b="p" data-p="${p}" title="افتح الصفحة في تقريب المعاني"><small>التقريب</small> ص ${ar(p)}</button></div>
          <div class="meta">${v0 ? `${esc(v0.s)} · <a href="#b=${v0.n}" data-go="${v0.n}">أبيات هذا الموضع</a>` : ''}</div>
        </div>`;
      }).join('');
    }
    if (!shown.length && !r.secs.length && !r.pages.length) {
      html = `<div class="empty"><p>لا توجد نتيجة لـ «${esc(raw.trim())}».</p>
        <p>جرّب كلمة واحدة أو جزءًا منها؛ التشكيل والهمزات لا تؤثر في البحث.</p>
        <button class="ghost" type="button" data-clear="1">عرض المتن كاملًا</button></div>`;
    }
    list.innerHTML = html;
    status.textContent = r.res.length || r.pages.length
      ? (r.num !== null
        ? `نتائج الرقم ${ar(r.num)}: رقم بيت، ثم أبيات الصفحة ${ar(r.num)} في أي من الشروح، ثم رقم البيت داخل الأبواب`
        : `الأبيات المطابقة: ${ar(r.res.length)}` + (r.res.length > MAX_RESULTS ? ` (تُعرض أول ${ar(MAX_RESULTS)})` : '')
          + (r.pages.length ? ` · صفحات ذُكرت فيها الكلمة القرآنية: ${ar(r.pages.length)}` : ''))
      : '';
    window.scrollTo(0, 0);
  };

  const goVerse = (n) => {
    q.value = ''; $('clear').hidden = true;
    renderAll();
    const el = $('b' + n);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2500);
    history.replaceState(null, '', '#b=' + n);
  };
  const goSection = (si) => {
    q.value = ''; $('clear').hidden = true;
    renderAll();
    const el = $('s' + si);
    if (el) el.scrollIntoView({ block: 'start' });
  };

  // ---------- section select ----------
  const sel = $('sec');
  sel.innerHTML = '<option value="">الأبواب والسور…</option>' +
    sections.map((s, si) => `<option value="${si}">${esc(s.name)}</option>`).join('');
  sel.addEventListener('change', () => { if (sel.value !== '') goSection(Number(sel.value)); sel.value = ''; });

  // ---------- events ----------
  let timer;
  q.addEventListener('input', () => {
    $('clear').hidden = !q.value;
    clearTimeout(timer);
    timer = setTimeout(() => renderSearch(q.value), 120);
  });
  $('clear').addEventListener('click', () => { q.value = ''; $('clear').hidden = true; renderAll(); q.focus(); });
  list.addEventListener('click', (e) => {
    const t = e.target.closest('[data-p],[data-go],[data-sec],[data-clear]');
    if (!t) return;
    if (t.dataset.p) openPage(t.dataset.b, Number(t.dataset.p), t.closest('.v'));
    else if (t.dataset.go) { e.preventDefault(); goVerse(Number(t.dataset.go)); }
    else if (t.dataset.sec) goSection(Number(t.dataset.sec));
    else { q.value = ''; $('clear').hidden = true; renderAll(); }
  });

  // ---------- PDF viewer (the user's own copies, kept on the device) ----------
  const viewer = $('viewer'), layout = $('layout'), canvas = $('canvas'), dlg = $('dlg');
  const pdfs = {};              // book id -> loaded PDF document
  let bk = BOOKS[0].id, cur = 1, pending = null, task = null, pickFor = null;

  const idb = (mode, fn) => new Promise((resolve, reject) => {
    const open = indexedDB.open('taqrib', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction('files', mode).objectStore('files'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });

  const loadPdf = async (id, blob) => {
    if (!window.pdfjsLib) throw new Error('تعذّر تحميل عارض PDF؛ تحقق من الاتصال بالإنترنت.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfs[id] = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  };

  const render = async (p) => {
    const pdf = pdfs[bk];
    cur = Math.min(Math.max(1, p), pdf.numPages);
    $('vpage').max = pdf.numPages;
    $('vpage').value = cur;
    $('vname').textContent = book(bk).short;
    const page = await pdf.getPage(cur);
    const width = Math.min($('vbody').clientWidth - 24, 900);
    const base = page.getViewport({ scale: 1 });
    const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale });
    if (task) task.cancel();
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = width + 'px';
    task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    try { await task.promise; } catch (err) { if (err.name !== 'RenderingCancelledException') throw err; }
    $('vbody').scrollTop = 0;
  };

  // The dialog lists every book with its state and a button to choose its file.
  const showDialog = (want) => {
    $('dlgpage').textContent = want ? `المطلوب: ${book(want.b).name} — الصفحة ${ar(want.p)}` : '';
    $('dlgbooks').innerHTML = BOOKS.map((b) => `
      <div class="bk">
        <div><strong>${b.name}</strong><span>${pdfs[b.id] ? 'الملف محفوظ على هذا الجهاز ✓' : 'لم يُختر ملفه بعد'}</span></div>
        <button type="button" class="${want && want.b === b.id && !pdfs[b.id] ? 'primary' : 'ghost'}" data-pick="${b.id}">${pdfs[b.id] ? 'تغيير الملف' : 'اختيار ملف PDF'}</button>
      </div>`).join('');
    if (!dlg.open) dlg.showModal();
  };

  let anchor = null;
  const openPage = async (id, p, rowEl) => {
    id = book(id).id;
    if (rowEl) anchor = rowEl;
    if (!pdfs[id]) {
      pending = { b: id, p };
      showDialog(pending);
      return;
    }
    bk = id;
    viewer.hidden = false;
    layout.classList.add('split');
    if (anchor && anchor.isConnected && window.matchMedia('(min-width: 901px)').matches) anchor.scrollIntoView({ block: 'center' });
    anchor = null;
    await render(p);
  };

  $('pick').addEventListener('click', () => { pending = null; showDialog(null); });
  $('dlgbooks').addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick]');
    if (!t) return;
    pickFor = t.dataset.pick;
    $('file').value = '';
    $('file').click();
  });
  $('dlgclose').addEventListener('click', () => dlg.close());
  $('file').addEventListener('change', async () => {
    const f = $('file').files[0];
    if (!f || !pickFor) return;
    const id = pickFor;
    try {
      await loadPdf(id, f);
      idb('readwrite', (st) => st.put(f, book(id).store)).catch(() => {});
      if (pending && pending.b === id) {
        const want = pending; pending = null;
        if (dlg.open) dlg.close();
        await openPage(want.b, want.p);
      } else if (dlg.open) {
        showDialog(pending);
      }
    } catch (err) {
      if (dlg.open) dlg.close();
      status.textContent = 'تعذّر فتح الملف: ' + err.message;
    }
  });
  $('vprev').addEventListener('click', () => render(cur - 1));
  $('vnext').addEventListener('click', () => render(cur + 1));
  $('vpage').addEventListener('change', () => render(Number($('vpage').value) || cur));
  $('vclose').addEventListener('click', () => { viewer.hidden = true; layout.classList.remove('split'); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !viewer.hidden && !dlg.open) $('vclose').click();
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });

  // ---------- start ----------
  renderAll();
  const m = location.hash.match(/^#b=(\d+)$/);
  if (m) goVerse(Number(m[1]));
  BOOKS.forEach((b) => idb('readonly', (st) => st.get(b.store)).then((blob) => blob && loadPdf(b.id, blob)).catch(() => {}));
})();
