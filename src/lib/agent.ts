// Script injected into every prototype. It runs inside a sandboxed iframe with an
// opaque origin, so it can't read Realframe's cookies or storage. It talks to the
// parent only through postMessage:
//   comment mode  → reports where the reviewer clicked, draws comment pins
//   edit mode     → highlights and selects elements, applies live style/text edits
//   routes        → follows #/hash routes the parent asks for and reports changes
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
      label: (el.getAttribute('aria-label') || (el.textContent || '').trim()).slice(0, 60) }; }
  function setEditing(on){ editing = !!on; if (!hoverBox) { hoverBox = box('#FB923C', true); selBox = box('#C2410C', false); }
    if (!editing) { selected = null; place(hoverBox, null); place(selBox, null); }
    document.documentElement.style.cursor = editing ? 'default' : (mode ? 'crosshair' : ''); }
  document.addEventListener('mousemove', function(e){ if (!editing || ours(e.target)) return; place(hoverBox, e.target); }, true);
  document.addEventListener('scroll', function(){ if (editing) { place(selBox, selected); place(hoverBox, null); } }, true);
  function target(m){ if (m.rf) return [].slice.call(document.querySelectorAll('[data-rf="' + m.rf + '"]'));
    try { return m.selector ? [].slice.call(document.querySelectorAll(m.selector)) : []; } catch (err) { return []; } }

  document.addEventListener('click', function(e){
    if (ours(e.target) && !(e.target.closest && e.target.closest('[data-rf-pin]'))) return;
    if (editing) { if (ours(e.target)) return; e.preventDefault(); e.stopPropagation();
      selected = e.target; place(selBox, selected); post(describe(selected)); return; }
    if (!mode) return;
    if (e.target && e.target.closest && e.target.closest('[data-rf-pin]')) return;
    e.preventDefault(); e.stopPropagation(); var s = size();
    post({ type: 'rf:pick', x: Math.min(1, e.pageX / s.w), y: Math.min(1, e.pageY / s.h) }); }, true);
  // Swallow form submits and link navigation while editing so clicks only select.
  document.addEventListener('submit', function(e){ if (editing) e.preventDefault(); }, true);

  window.addEventListener('message', function(e){ if (e.source !== parent) return; var m = e.data || {};
    if (m.type === 'rf:mode') { mode = !!m.on; if (!editing) document.documentElement.style.cursor = mode ? 'crosshair' : ''; }
    if (m.type === 'rf:pins') { pins = Array.isArray(m.pins) ? m.pins : []; draw(); }
    if (m.type === 'rf:edit') setEditing(m.on);
    if (m.type === 'rf:apply') { target(m).forEach(function(el){
        if (m.styles) Object.keys(m.styles).forEach(function(k){ el.style[k] = m.styles[k]; });
        if (typeof m.text === 'string') el.textContent = m.text; });
      if (selected) { place(selBox, selected); post(describe(selected)); } }
    if (m.type === 'rf:route' && typeof m.hash === 'string' && location.hash !== m.hash) { location.hash = m.hash; } });
  window.addEventListener('hashchange', function(){ post({ type: 'rf:route-changed', hash: location.hash }); });
  window.addEventListener('resize', function(){ draw(); if (editing) place(selBox, selected); });
  function ready(){ post({ type: 'rf:ready', hash: location.hash }); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();`;

export function withAgent(html: string) {
  const tag = `<script>${AGENT_SCRIPT}</script>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
}
