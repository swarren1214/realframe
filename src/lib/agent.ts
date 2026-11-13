// Script injected into every prototype. It runs inside a sandboxed iframe with an
// opaque origin, so it can't read Realframe's cookies or storage. It only reports
// where the reviewer clicked and draws comment pins it is told about.
export const AGENT_SCRIPT = `(function(){
  var mode = false, layer = null, pins = [];
  function size(){ var d = document.documentElement, b = document.body || d;
    return { w: Math.max(d.scrollWidth, b.scrollWidth, 1), h: Math.max(d.scrollHeight, b.scrollHeight, 1) }; }
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
      b.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation();
        parent.postMessage({ type: 'rf:select', id: p.id }, '*'); });
      l.appendChild(b); }); }
  document.addEventListener('click', function(e){ if (!mode) return;
    if (e.target && e.target.closest && e.target.closest('[data-rf-pin]')) return;
    e.preventDefault(); e.stopPropagation(); var s = size();
    parent.postMessage({ type: 'rf:pick', x: Math.min(1, e.pageX / s.w), y: Math.min(1, e.pageY / s.h) }, '*'); }, true);
  window.addEventListener('message', function(e){ if (e.source !== parent) return; var m = e.data || {};
    if (m.type === 'rf:mode') { mode = !!m.on; document.documentElement.style.cursor = mode ? 'crosshair' : ''; }
    if (m.type === 'rf:pins') { pins = Array.isArray(m.pins) ? m.pins : []; draw(); } });
  window.addEventListener('resize', draw);
  function ready(){ parent.postMessage({ type: 'rf:ready' }, '*'); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();`;

export function withAgent(html: string) {
  const tag = `<script>${AGENT_SCRIPT}</script>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
}
