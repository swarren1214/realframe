import SwiftUI

/// Full-screen prototype with pinned comments. Browse to use it; switch to Comment to drop a pin.
struct ReviewView: View {
    let projectId: String
    let version: Version
    let canComment: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var html: String?
    @State private var threads: [CommentThread] = []
    @State private var commentMode = false
    @State private var selected: CommentThread?
    @State private var draft: Draft?
    @State private var error: String?

    struct Draft: Identifiable { let id = UUID(); let x: Double; let y: Double }

    private var pins: [AgentPin] {
        threads.enumerated().map { index, t in
            AgentPin(id: t.id, n: index + 1, x: t.x, y: t.y, status: t.status, selected: t.id == selected?.id)
        }
    }

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            if let html {
                PrototypeWebView(html: html, commentMode: commentMode, pins: pins) { event in
                    switch event {
                    case .ready: break
                    case let .pick(x, y): draft = Draft(x: x, y: y)
                    case let .select(id): selected = threads.first { $0.id == id }
                    }
                }
                .ignoresSafeArea(edges: .bottom)
            } else if let error {
                ContentUnavailableView("Couldn't open this version", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .overlay(alignment: .top) { topBar }
        .overlay(alignment: .bottom) { if canComment { modeSwitch } }
        .sheet(item: $selected) { thread in
            ThreadSheet(thread: thread, number: (threads.firstIndex(of: thread) ?? 0) + 1) { await loadThreads() }
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $draft) { draft in
            NewThreadSheet { body in
                try await API.shared.createThread(projectId: projectId, versionId: version.id, x: draft.x, y: draft.y, body: body)
                commentMode = false
                await loadThreads()
            }
            .presentationDetents([.height(240)])
        }
        .task {
            do {
                html = try await API.shared.document(versionId: version.id)
            } catch {
                self.error = error.localizedDescription
            }
            await loadThreads()
        }
    }

    private var topBar: some View {
        HStack {
            Button("Close", systemImage: "xmark") { dismiss() }
                .labelStyle(.iconOnly)
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
            Spacer()
            Text("Version \(version.number)")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .glassEffect(.regular, in: .capsule)
            Spacer()
            Button {
                selected = threads.first(where: \.isOpen) ?? threads.first
            } label: {
                Label("\(threads.filter(\.isOpen).count)", systemImage: "bubble.left.fill")
            }
            .buttonStyle(.glass)
            .disabled(threads.isEmpty)
            .accessibilityLabel("\(threads.filter(\.isOpen).count) open comments")
        }
        .padding(.horizontal, 16)
    }

    private var modeSwitch: some View {
        VStack(spacing: 10) {
            if commentMode {
                Text("Tap anywhere to drop a comment")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.9), in: .capsule)
            }
            Picker("Mode", selection: $commentMode) {
                Label("Browse", systemImage: "cursorarrow").tag(false)
                Label("Comment", systemImage: "mappin").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(width: 240)
            .padding(6)
            .glassEffect(.regular, in: .capsule)
        }
        .padding(.bottom, 12)
    }

    private func loadThreads() async {
        threads = (try? await API.shared.threads(projectId: projectId, versionId: version.id)) ?? threads
        if let current = selected { selected = threads.first { $0.id == current.id } }
    }
}

struct NewThreadSheet: View {
    let submit: (String) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("New comment").font(.headline)
            TextField("What should change here?", text: $text, axis: .vertical)
                .lineLimit(3...6)
                .padding(12)
                .background(Theme.card, in: .rect(cornerRadius: 14))
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            Button {
                busy = true
                Task {
                    do {
                        try await submit(text.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    } catch {
                        self.error = error.localizedDescription
                    }
                    busy = false
                }
            } label: {
                Text("Post").fontWeight(.semibold).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(20)
    }
}
