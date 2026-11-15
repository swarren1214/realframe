// Script injected into every prototype. It runs inside a sandboxed iframe with an
// opaque origin, so it can't read Realframe's cookies or storage. It talks to the
// parent only through postMessage:
//   comment mode  → reports where the reviewer clicked, draws comment pins
//   edit mode     → highlights and selects elements, applies live style/text edits
//   routes        → follows #/hash routes the parent asks for and reports changes
// Export: hands back one element's markup and the CSS that styles it (rules that match it or
// anything inside it, the page's base rules, and the fonts and keyframes they use). Kept in its
// own raw string so the regular expressions inside keep their backslashes.
const EXTRACT_SCRIPT = String.raw`
  var DYNAMIC = /::?(before|after|placeholder|marker|selection|first-line|first-letter|hover|focus-visible|focus-within|focus|active|visited|link|checked|disabled|enabled|invalid|valid|target|backdrop)\b(\([^)]*\))?/g;
  function extract(m){
    var el = target(m)[0];
    if (!el) return { type: 'rf:extracted', id: m.id, error: 'That element is no longer on the page.' };
    var nodes = [el].concat([].slice.call(el.querySelectorAll('*')));
    var base = [document.documentElement, document.body];
    function hits(sel, list){ for (var i = 0; i < list.length; i++) { try { if (list[i].matches(sel)) return true; } catch (e) { return false; } } return false; }
    function matches(sel){ if (hits(sel, nodes) || hits(sel, base)) return true;
      var loose = sel.replace(DYNAMIC, '').replace(/(^|[\s,>+~])(?=[\s,>+~]|$)/g, '$1*');
      return loose !== sel && (hits(loose, nodes) || hits(loose, base)); }
    var fonts = [], faces = [], frames = {};
    function walk(rules){ var out = [];
      for (var i = 0; i < rules.length; i++) { var r = rules[i];
        if (r.type === 1) { if (matches(r.selectorText)) out.push(r.cssText); }
        else if (r.type === 4 || r.type === 12) { var inner = walk(r.cssRules); if (inner.length) out.push((r.type === 4 ? '@media ' + r.conditionText : '@supports ' + r.conditionText) + ' {\n' + inner.join('\n') + '\n}'); }
        else if (r.type === 5) faces.push(r.cssText);
        else if (r.type === 7) frames[r.name] = r.cssText;
        else if (r.type === 3 && r.href) fonts.push(r.href); }
      return out; }
    var css = [];
    for (var s = 0; s < document.styleSheets.length; s++) { var sheet = document.styleSheets[s], rules = null;
      try { rules = sheet.cssRules; } catch (e) { if (sheet.href) fonts.push(sheet.href); continue; }
      if (rules) css = css.concat(walk(rules)); }
    var text = css.join('\n');
    var used = Object.keys(frames).filter(function(n){ return text.indexOf(n) >= 0; }).map(function(n){ return frames[n]; });
    var html = (el.outerHTML || '').replace(/<script[\s\S]*?<\/script>/gi, '');
    return { type: 'rf:extracted', id: m.id, html: html, label: (el.getAttribute('aria-label') || (el.innerText || '').trim()).slice(0, 60),
      tag: el.tagName.toLowerCase(), css: faces.concat(css, used).join('\n\n'), fonts: fonts }; }
  window.addEventListener('message', function(e){ if (e.source !== parent) return; var m = e.data || {};
    if (m.type === 'rf:extract') post(extract(m)); });
`;

// Dev mode: hover shows an element's box model, click selects it, and with a selection, hovering
// another element measures the distance between them (Alt: to the selection's parent). Also
// answers for the element tree and the design tokens in use. Drawn in a data-rf-ui layer.
const INSPECT_SCRIPT = String.raw`
  var insp = false, iSel = null, iHover = null, iAlt = false, iLayer = null, iHi = [];
  var ISTYLES = ['display','position','width','height','color','backgroundColor','backgroundImage','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','borderRadius','borderColor','boxShadow','opacity','gap','gridTemplateColumns','flexDirection','justifyContent','alignItems','zIndex','overflow'];
  function iPx(v){ return parseFloat(v) || 0; }
  function iSides(cs, p){ return [iPx(cs[p + 'Top']), iPx(cs[p + 'Right']), iPx(cs[p + 'Bottom']), iPx(cs[p + 'Left'])]; }
  function iBorders(cs){ return ['Top','Right','Bottom','Left'].map(function(s){ return iPx(cs['border' + s + 'Width']); }); }
  function iLayerEl(){ if (iLayer && iLayer.isConnected) return iLayer; iLayer = document.createElement('div'); iLayer.setAttribute('data-rf-ui', '');
    iLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646'; document.documentElement.appendChild(iLayer); return iLayer; }
  function iRect(x, y, w, h, bg, line){ var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:' + Math.max(w, 0) + 'px;height:' + Math.max(h, 0) + 'px;background:' + (bg || 'transparent') + ';' + (line ? 'outline:' + line + ';' : '') + 'box-sizing:border-box'; return d; }
  function iTag(x, y, text, bg){ var d = document.createElement('div'); d.textContent = text;
    d.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:' + bg + ';padding:1px 5px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-50%)'; return d; }
  function iName(el){ var c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c.length ? '.' + c.join('.') : ''); }
  function iBox(l, el, strong){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el), m = iSides(cs, 'margin'), b = iBorders(cs), p = iSides(cs, 'padding');
    var mc = 'rgba(234,88,12,.2)', pc = 'rgba(34,197,94,.22)';
    l.appendChild(iRect(r.left - m[3], r.top - m[0], r.width + m[1] + m[3], m[0], mc));
    l.appendChild(iRect(r.left - m[3], r.bottom, r.width + m[1] + m[3], m[2], mc));
    l.appendChild(iRect(r.left - m[3], r.top, m[3], r.height, mc));
    l.appendChild(iRect(r.right, r.top, m[1], r.height, mc));
    var ix = r.left + b[3], iy = r.top + b[0], iw = r.width - b[1] - b[3], ih = r.height - b[0] - b[2];
    l.appendChild(iRect(ix, iy, iw, p[0], pc));
    l.appendChild(iRect(ix, iy + ih - p[2], iw, p[2], pc));
    l.appendChild(iRect(ix, iy + p[0], p[3], ih - p[0] - p[2], pc));
    l.appendChild(iRect(ix + iw - p[1], iy + p[0], p[1], ih - p[0] - p[2], pc));
    l.appendChild(iRect(ix + p[3], iy + p[0], iw - p[1] - p[3], ih - p[0] - p[2], 'rgba(59,130,246,.14)'));
    l.appendChild(iRect(r.left, r.top, r.width, r.height, null, strong ? '2px solid #db2777' : '1px dashed #0284c7'));
    var chip = document.createElement('div'); chip.textContent = iName(el) + '  ' + Math.round(r.width) + ' × ' + Math.round(r.height);
    chip.style.cssText = 'position:fixed;left:' + Math.max(r.left, 2) + 'px;top:' + (r.top > 26 ? r.top - 22 : r.bottom + 4) + 'px;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:' + (strong ? '#db2777' : '#0284c7') + ';padding:2px 6px;border-radius:5px;white-space:nowrap';
    l.appendChild(chip); }
  function iH(l, x1, x2, y, c){ if (x2 - x1 < 1) return; l.appendChild(iRect(x1, y, x2 - x1, 1, c)); l.appendChild(iTag((x1 + x2) / 2, y - 10, String(Math.round(x2 - x1)), c)); }
  function iV(l, y1, y2, x, c){ if (y2 - y1 < 1) return; l.appendChild(iRect(x, y1, 1, y2 - y1, c)); l.appendChild(iTag(x + 18, (y1 + y2) / 2, String(Math.round(y2 - y1)), c)); }
  function iMeasure(l, a, b, c){
    var cy = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2; if (!(cy >= a.top && cy <= a.bottom)) cy = (a.top + a.bottom) / 2;
    var cx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2; if (!(cx >= a.left && cx <= a.right)) cx = (a.left + a.right) / 2;
    if (b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom) {
      iH(l, b.left, a.left, cy, c); iH(l, a.right, b.right, cy, c); iV(l, b.top, a.top, cx, c); iV(l, a.bottom, b.bottom, cx, c); return; }
    if (a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) {
      iH(l, a.left, b.left, (b.top + b.bottom) / 2, c); iH(l, b.right, a.right, (b.top + b.bottom) / 2, c);
      iV(l, a.top, b.top, (b.left + b.right) / 2, c); iV(l, b.bottom, a.bottom, (b.left + b.right) / 2, c); return; }
    if (b.right <= a.left) iH(l, b.right, a.left, cy, c); else if (b.left >= a.right) iH(l, a.right, b.left, cy, c);
    if (b.bottom <= a.top) iV(l, b.bottom, a.top, cx, c); else if (b.top >= a.bottom) iV(l, a.bottom, b.top, cx, c); }
  function iDraw(){ var l = iLayerEl(); l.innerHTML = ''; if (!insp) return;
    iHi.forEach(function(el){ if (!el.isConnected) return; var r = el.getBoundingClientRect(); l.appendChild(iRect(r.left, r.top, r.width, r.height, 'rgba(124,58,237,.12)', '1px solid #7c3aed')); });
    var sel = iSel && iSel.isConnected ? iSel : null;
    if (sel) iBox(l, sel, true);
    var other = iAlt && sel && sel.parentElement ? sel.parentElement : (iHover && iHover.isConnected && iHover !== sel ? iHover : null);
    if (!other) return;
    if (sel) { var ro = other.getBoundingClientRect(); l.appendChild(iRect(ro.left, ro.top, ro.width, ro.height, null, '1px dashed #0284c7')); iMeasure(l, sel.getBoundingClientRect(), ro, '#db2777'); }
    else iBox(l, other, false); }
  function iSrc(el){ var v = el && el.getAttribute ? el.getAttribute('data-rf-src') : null; return v === null ? null : Number(v); }
  function iNearest(el){ while (el && el.nodeType === 1) { var s = iSrc(el); if (s !== null) return s; el = el.parentElement; } return null; }
  function iDescribe(el){ var cs = getComputedStyle(el), st = {}; ISTYLES.forEach(function(p){ st[p] = cs[p]; }); var r = el.getBoundingClientRect();
    return { type: 'rf:inspected', path: pathOf(el), tag: el.tagName.toLowerCase(), id: el.id || '', cls: typeof el.className === 'string' ? el.className.trim() : '',
      src: iSrc(el), nearestSrc: iNearest(el), rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      box: { margin: iSides(cs, 'margin'), border: iBorders(cs), padding: iSides(cs, 'padding') }, styles: st, text: (el.innerText || '').trim().slice(0, 80) }; }
  var ISKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/;
  function iTree(){ var out = [];
    (function walk(el, depth){ for (var i = 0; i < el.children.length && out.length < 3000; i++) { var c = el.children[i];
      if (ours(c) || ISKIP.test(c.tagName)) continue; var t = '';
      for (var k = 0; k < c.childNodes.length; k++) if (c.childNodes[k].nodeType === 3) t += c.childNodes[k].nodeValue;
      out.push({ path: pathOf(c), depth: depth, tag: c.tagName.toLowerCase(), id: c.id || '', cls: typeof c.className === 'string' ? c.className.trim() : '',
        text: t.trim().replace(/\s+/g, ' ').slice(0, 40), kids: c.children.length, src: iSrc(c) });
      walk(c, depth + 1); } })(document.body, 0);
    return out; }
  function iHasText(el){ for (var k = 0; k < el.childNodes.length; k++) { var n = el.childNodes[k]; if (n.nodeType === 3 && n.nodeValue.trim()) return true; } return false; }
  function iFont(cs){ return cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() + ' ' + cs.fontWeight; }
  function iEach(fn){ var els = document.body.querySelectorAll('*'); for (var i = 0; i < els.length && i < 6000; i++) { var el = els[i];
      if (ours(el) || ISKIP.test(el.tagName)) continue; fn(el, getComputedStyle(el)); } }
  var IGAPS = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginBottom','rowGap','columnGap'];
  function iTokens(){ var maps = { colors: {}, fonts: {}, sizes: {}, radii: {}, spacing: {}, shadows: {} };
    function add(m, v){ if (v) m[v] = (m[v] || 0) + 1; }
    iEach(function(el, cs){
      if (iHasText(el)) { add(maps.colors, cs.color); add(maps.fonts, iFont(cs)); add(maps.sizes, cs.fontSize + ' / ' + cs.lineHeight); }
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') add(maps.colors, cs.backgroundColor);
      if (iPx(cs.borderTopWidth) > 0) add(maps.colors, cs.borderTopColor);
      if (cs.borderTopLeftRadius !== '0px') add(maps.radii, cs.borderTopLeftRadius);
      if (cs.boxShadow !== 'none') add(maps.shadows, cs.boxShadow);
      IGAPS.forEach(function(p){ var v = cs[p]; if (v && v !== '0px' && v !== 'normal' && v !== 'auto') add(maps.spacing, v); }); });
    function list(m){ return Object.keys(m).map(function(k){ return { value: k, count: m[k] }; }).sort(function(a, b){ return b.count - a.count; }).slice(0, 40); }
    return { colors: list(maps.colors), fonts: list(maps.fonts), sizes: list(maps.sizes), radii: list(maps.radii), spacing: list(maps.spacing), shadows: list(maps.shadows) }; }
  function iFind(kind, value){ var out = [];
    iEach(function(el, cs){ var hit = false;
      if (kind === 'colors') hit = (iHasText(el) && cs.color === value) || cs.backgroundColor === value || (iPx(cs.borderTopWidth) > 0 && cs.borderTopColor === value);
      else if (kind === 'fonts') hit = iHasText(el) && iFont(cs) === value;
      else if (kind === 'sizes') hit = iHasText(el) && cs.fontSize + ' / ' + cs.lineHeight === value;
      else if (kind === 'radii') hit = cs.borderTopLeftRadius === value;
      else if (kind === 'shadows') hit = cs.boxShadow === value;
      else if (kind === 'spacing') hit = IGAPS.some(function(p){ return cs[p] === value; });
      if (hit && out.length < 400) out.push(el); });
    return out; }
  document.addEventListener('mousemove', function(e){ if (!insp || ours(e.target)) return; if (iHover !== e.target) { iHover = e.target; iDraw(); } }, true);
  document.addEventListener('mouseleave', function(){ if (insp) { iHover = null; iDraw(); } });
  document.addEventListener('click', function(e){ if (!insp || ours(e.target)) return; e.preventDefault(); e.stopPropagation(); iSel = e.target; iDraw(); post(iDescribe(iSel)); }, true);
  document.addEventListener('submit', function(e){ if (insp) e.preventDefault(); }, true);
  window.addEventListener('keydown', function(e){ if (insp && e.key === 'Alt' && !iAlt) { iAlt = true; iDraw(); } });
  window.addEventListener('keyup', function(e){ if (insp && e.key === 'Alt') { iAlt = false; iDraw(); } });
  window.addEventListener('scroll', function(){ if (insp) iDraw(); }, true);
  window.addEventListener('resize', function(){ if (insp) iDraw(); });
  window.addEventListener('message', function(e){ if (e.source !== parent) return; var m = e.data || {};
    if (m.type === 'rf:inspect') { insp = !!m.on; if (!insp) { iSel = null; iHover = null; iHi = []; iAlt = false; } iDraw(); }
    if (m.type === 'rf:inspect-select' && typeof m.path === 'string') { var el = m.path === '' ? document.body : byPath(m.path); if (el) { iSel = el; if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); iDraw(); post(iDescribe(el)); } }
    if (m.type === 'rf:inspect-hover') { iHover = typeof m.path === 'string' ? (m.path === '' ? document.body : byPath(m.path)) : null; iDraw(); }
    if (m.type === 'rf:inspect-alt') { iAlt = !!m.on; iDraw(); }
    if (m.type === 'rf:inspect-highlight') { iHi = m.kind ? iFind(m.kind, m.value) : []; iDraw(); }
    if (m.type === 'rf:tree') post({ type: 'rf:tree', id: m.id, nodes: iTree() });
    if (m.type === 'rf:tokens') post({ type: 'rf:tokens', id: m.id, tokens: iTokens() }); });
`;

export const AGENT_SCRIPT = `(function(){
  var mode = false, editing = false, layer = null, pins = [], hoverBox = null, selBox = null, selected = null;
  var STYLE_PROPS = ['color','backgroundColor','fontSize','fontWeight','lineHeight','letterSpacing','textAlign',
    'paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginBottom','borderRadius','gap','display','width','height'];
  function post(m){ parent.postMessage(m, '*'); }
  function size(){ var d = document.documentElement, b = document.body || d;
    return { w: Math.max(d.scrollWidth, b.scrollWidth, 1), h: Math.max(d.scrollHeight, b.scrollHeight, 1) }; }
  function ours(el){ return !!(el && el.closest && el.closest('[data-rf-layer],[data-rf-ui]')); }
  function getLayer(){ if (layer && layer.isConnected) return layer;
    layer = document.createElement('div'); layer.setAttribute('data-rf-layer', '');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none';
    (document.body || document.documentElement).appendChild(layer); return layer; }
  function draw(){ var l = getLayer(); l.innerHTML = ''; var s = size();
    pins.forEach(function(p){ var b = document.createElement('button'); b.type = 'button';
      b.setAttribute('data-rf-pin', p.id); b.setAttribute('aria-label', 'Comment ' + p.n); b.textContent = p.n;
      b.style.cssText = 'position:absolute;pointer-events:auto;transform:translate(-4px,-28px);width:28px;height:28px;'
        + 'border-radius:14px 14px 14px 4px;border:2px solid #fff;font:700 12px system-ui,sans-serif;color:#fff;cursor:pointer;'
        + 'box-shadow:0 4px 10px rgba(0,0,0,.25);padding:0;background:' + (p.status === 'resolved' ? '#57534E' : '#C2410C')
        + (p.selected ? ';outline:3px solid #FDBA74' : '');
      b.style.left = (p.x * s.w) + 'px'; b.style.top = (p.y * s.h) + 'px';
      b.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); post({ type: 'rf:select', id: p.id }); });
      l.appendChild(b); }); }

  // ---- Edit mode ---------------------------------------------------------------
  function box(color, dashed){ var b = document.createElement('div'); b.setAttribute('data-rf-ui', '');
    b.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px ' + (dashed ? 'dashed ' : 'solid ') + color
      + ';border-radius:2px;display:none;box-sizing:border-box';
    document.documentElement.appendChild(b); return b; }
  function place(b, el){ if (!b) return; if (!el || !el.isConnected) { b.style.display = 'none'; return; }
    var r = el.getBoundingClientRect(); b.style.display = 'block';
    b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = r.width + 'px'; b.style.height = r.height + 'px'; }
  function nthOfType(el){ var i = 1, s = el; while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++; return i; }
  // A selector that survives saving: anchored on the nearest element with a stable data-rf id.
  function pathFor(el){ var parts = [], cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement) {
      var id = cur.getAttribute('data-rf');
      if (id) { parts.unshift('[data-rf="' + id + '"]'); return parts.join(' > '); }
      parts.unshift(cur.tagName.toLowerCase() + ':nth-of-type(' + nthOfType(cur) + ')'); cur = cur.parentElement; }
    parts.unshift('body'); return parts.join(' > '); }
  function leafText(el){ for (var i = 0; i < el.children.length; i++) { if (!/^(BR|WBR)$/.test(el.children[i].tagName)) return null; }
    return el.textContent; }
  function describe(el){ var cs = getComputedStyle(el), styles = {};
    STYLE_PROPS.forEach(function(p){ styles[p] = cs[p]; });
    var r = el.getBoundingClientRect();
    return { type: 'rf:selected', rf: el.getAttribute('data-rf'), selector: pathFor(el), tag: el.tagName.toLowerCase(),
      text: leafText(el), styles: styles, rect: { w: Math.round(r.width), h: Math.round(r.height) },
      label: (el.getAttribute('aria-label') || (el.innerText || '').trim()).slice(0, 60),
      html: (el.outerHTML || '').replace(/<script[\\s\\S]*?<\\/script>/gi, '').slice(0, 2000) }; }
  function setEditing(on){ editing = !!on; if (!hoverBox) { hoverBox = box('#FB923C', true); selBox = box('#C2410C', false); }
    if (!editing) { selected = null; place(hoverBox, null); place(selBox, null); }
    document.documentElement.style.cursor = editing ? 'default' : (mode ? 'crosshair' : '');
    document.documentElement.style.userSelect = editing ? 'none' : ''; }
  document.addEventListener('mousemove', function(e){ if (!editing || ours(e.target)) return; place(hoverBox, e.target); }, true);
  document.addEventListener('scroll', function(){ if (editing) { place(selBox, selected); place(hoverBox, null); } }, true);
  function target(m){ if (m.rf) return [].slice.call(document.querySelectorAll('[data-rf="' + m.rf + '"]'));
    try { return m.selector ? [].slice.call(document.querySelectorAll(m.selector)) : []; } catch (err) { return []; } }

  document.addEventListener('click', function(e){
    if (ours(e.target) && !(e.target.closest && e.target.closest('[data-rf-pin]'))) return;
    if (editing) { if (ours(e.target)) return; e.preventDefault(); e.stopPropagation();
      selected = e.target; place(selBox, selected); var d = describe(selected); d.shift = !!e.shiftKey; post(d); return; }
    if (!mode) return;
    if (e.target && e.target.closest && e.target.closest('[data-rf-pin]')) return;
    e.preventDefault(); e.stopPropagation(); var s = size();
    post({ type: 'rf:pick', x: Math.min(1, e.pageX / s.w), y: Math.min(1, e.pageY / s.h) }); }, true);
  // Swallow form submits and link navigation while editing so clicks only select.
  document.addEventListener('submit', function(e){ if (editing) e.preventDefault(); }, true);

  window.addEventListener('message', function(e){ if (e.source !== parent) return; var m = e.data || {};
    if (m.type === 'rf:ping' && document.readyState === 'complete') ready();
    if (m.type === 'rf:mode') { mode = !!m.on; if (!editing) document.documentElement.style.cursor = mode ? 'crosshair' : ''; }
    if (m.type === 'rf:pins') { pins = Array.isArray(m.pins) ? m.pins : []; draw(); }
    if (m.type === 'rf:edit') setEditing(m.on);
    if (m.type === 'rf:apply') { target(m).forEach(function(el){
        if (m.styles) Object.keys(m.styles).forEach(function(k){ el.style[k] = m.styles[k]; });
        if (typeof m.text === 'string') el.textContent = m.text; });
      if (selected) { place(selBox, selected); post(describe(selected)); } }
    if (m.type === 'rf:scroll-to' && typeof m.y === 'number') { syncUntil = Date.now() + 200;
      var se = m.path ? byPath(m.path) : (document.scrollingElement || document.documentElement);
      if (se) se.scrollTop = m.y * Math.max(0, se.scrollHeight - se.clientHeight); }
    if (m.type === 'rf:route' && typeof m.hash === 'string' && location.hash !== m.hash) { location.hash = m.hash; } });
  // Compare view: report scrolling (as a fraction of the scrollable height) so the other side can follow.
  var syncUntil = 0, scrollQueued = false;
  function pathOf(el){ var parts = []; while (el && el !== document.body && el.parentElement) { parts.unshift(Array.prototype.indexOf.call(el.parentElement.children, el)); el = el.parentElement; } return parts.join('.'); }
  function byPath(path){ var el = document.body; var parts = path.split('.'); for (var i = 0; i < parts.length && el; i++) el = el.children[+parts[i]]; return el || null; }
  document.addEventListener('scroll', function(e){ if (Date.now() < syncUntil || scrollQueued) return; scrollQueued = true; var t = e.target;
    requestAnimationFrame(function(){ scrollQueued = false;
      var whole = t === document || t === document.documentElement || t === document.body;
      var el = whole ? (document.scrollingElement || document.documentElement) : t;
      var max = el.scrollHeight - el.clientHeight;
      post({ type: 'rf:scroll', path: whole ? '' : pathOf(t), y: max > 0 ? el.scrollTop / max : 0 }); }); }, true);
  window.addEventListener('hashchange', function(){ post({ type: 'rf:route-changed', hash: location.hash }); });
  window.addEventListener('resize', function(){ draw(); if (editing) place(selBox, selected); });
  function ready(){ post({ type: 'rf:ready', hash: location.hash }); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
  ${EXTRACT_SCRIPT}
  ${INSPECT_SCRIPT}
})();`;

// Prototypes run with an opaque origin, where touching localStorage, sessionStorage or
// document.cookie throws. Many apps do that on load, so swap in in-memory stand-ins first:
// the app works, and anything it saves lasts until the page reloads.
export const STORAGE_SHIM = `(function(){
  function mem(){ var d = {}; return {
    getItem: function(k){ k = String(k); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function(k, v){ d[String(k)] = String(v); },
    removeItem: function(k){ delete d[String(k)]; },
    clear: function(){ d = {}; },
    key: function(i){ return Object.keys(d)[i] || null; },
    get length(){ return Object.keys(d).length; } }; }
  ['localStorage', 'sessionStorage'].forEach(function(n){
    try { window[n].getItem('rf'); } catch (e) {
      try { Object.defineProperty(window, n, { value: mem(), configurable: true }); } catch (_) {} } });
  try { void document.cookie; } catch (e) {
    try { var jar = ''; Object.defineProperty(document, 'cookie', { configurable: true,
      get: function(){ return jar; }, set: function(v){ var c = String(v).split(';')[0]; jar = jar ? jar + '; ' + c : c; } }); } catch (_) {} }
})();`;

export function withAgent(html: string) {
  const tag = `<script>${AGENT_SCRIPT}</script>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  let out = at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
  // The stand-in must run before the app's own scripts: first thing in <head>.
  const shim = `<script>${STORAGE_SHIM}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(out);
  if (head) {
    const end = head.index + head[0].length;
    out = out.slice(0, end) + shim + out.slice(end);
  } else {
    out = shim + out;
  }
  return out;
}
