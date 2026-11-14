import { ApiError, route } from "@/lib/api/v1";
import { withAgent } from "@/lib/agent";

// Forwards the agent's messages (pin taps, pin selection, readiness, route changes) to the
// native app. The agent posts to `parent`, which is the page itself when it is not in an
// iframe; this listener hands those messages to WKWebView or the Android WebView bridge.
// The app talks back with window.postMessage({ type: "rf:mode" | "rf:pins" | ... }, "*").
const NATIVE_BRIDGE = `(function(){
  function send(m){ try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rf) window.webkit.messageHandlers.rf.postMessage(m);
    else if (window.RealframeAndroid) window.RealframeAndroid.post(JSON.stringify(m));
  } catch (e) {} }
  window.addEventListener('message', function(e){ var m = e.data;
    if (m && typeof m.type === 'string' && /^rf:(ready|pick|select|route-changed)$/.test(m.type)) send(m); });
})();`;

// GET /v1/versions/:id/document → the version's HTML, ready for a native WebView.
// The app loads it with no base URL (an opaque origin), so prototype code can't reach
// the app's session, mirroring the web app's sandboxed iframe.
export const GET = route<{ id: string }>(async (_request, { supabase }, { id }) => {
  const { data: version } = await supabase.from("versions").select("id, html, kind").eq("id", id).maybeSingle();
  if (!version) throw new ApiError(404, "Version not found.", "not_found");
  if (version.kind === "bundle") {
    throw new ApiError(422, "Imported apps open in the browser for now.", "imported_app");
  }
  let html = withAgent(version.html as string);
  const bridge = `<script>${NATIVE_BRIDGE}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  html = head ? html.slice(0, head.index + head[0].length) + bridge + html.slice(head.index + head[0].length) : bridge + html;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
});
