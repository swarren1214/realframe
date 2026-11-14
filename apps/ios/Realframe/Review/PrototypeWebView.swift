import SwiftUI
import WebKit

/// Messages from the pin agent injected by /v1/versions/:id/document.
enum AgentEvent {
    case ready
    case pick(x: Double, y: Double)
    case select(threadId: String)
}

/// A pin as the agent draws it.
struct AgentPin: Encodable {
    let id: String
    let n: Int
    let x: Double
    let y: Double
    let status: String
    let selected: Bool
}

/// Shows one prototype version. The HTML loads with no base URL, so it runs in an opaque
/// origin with a throwaway data store: prototype code can't see the app's session or
/// storage, the same isolation the web app gets from its sandboxed iframe.
struct PrototypeWebView: UIViewRepresentable {
    let html: String
    let commentMode: Bool
    let pins: [AgentPin]
    let onEvent: (AgentEvent) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(WeakHandler(context.coordinator), name: "rf")
        config.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isInspectable = true
        context.coordinator.webView = view
        view.loadHTMLString(html, baseURL: nil)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.onEvent = onEvent
        context.coordinator.sync(commentMode: commentMode, pins: pins)
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "rf")
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?
        var onEvent: (AgentEvent) -> Void
        private var ready = false
        private var commentMode = false
        private var pins: [AgentPin] = []

        init(onEvent: @escaping (AgentEvent) -> Void) { self.onEvent = onEvent }

        func sync(commentMode: Bool, pins: [AgentPin]) {
            self.commentMode = commentMode
            self.pins = pins
            guard ready else { return }
            post(["type": "rf:mode", "on": commentMode])
            if let data = try? JSONEncoder().encode(pins), let json = String(data: data, encoding: .utf8) {
                webView?.evaluateJavaScript("window.postMessage({type:'rf:pins',pins:\(json)},'*')")
            }
        }

        private func post(_ message: [String: Any]) {
            guard let data = try? JSONSerialization.data(withJSONObject: message),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript("window.postMessage(\(json),'*')")
        }

        func receive(_ body: Any) {
            guard let m = body as? [String: Any], let type = m["type"] as? String else { return }
            switch type {
            case "rf:ready":
                ready = true
                sync(commentMode: commentMode, pins: pins)
                onEvent(.ready)
            case "rf:pick":
                if let x = m["x"] as? Double, let y = m["y"] as? Double { onEvent(.pick(x: x, y: y)) }
            case "rf:select":
                if let id = m["id"] as? String { onEvent(.select(threadId: id)) }
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // The agent answers a ping with rf:ready once the page has loaded.
            post(["type": "rf:ping"])
        }

        /// Only the prototype's own document and in-page (#hash) routes load here.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            if url.scheme == "about" || url.scheme == "data" { return .allow }
            if action.navigationType == .linkActivated, url.scheme == "https" || url.scheme == "http" {
                await UIApplication.shared.open(url)
            }
            return .cancel
        }
    }

    /// WKUserContentController holds its handlers strongly; this breaks the cycle.
    final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: Coordinator?
        init(_ target: Coordinator) { self.target = target }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            let body = message.body
            Task { @MainActor in self.target?.receive(body) }
        }
    }
}
