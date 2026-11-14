import SwiftUI

/// The prompt history as a conversation, the live build, and a composer.
@MainActor
@Observable
final class StudioModel {
    let projectId: String
    var detail: ProjectDetail?
    var error: String?
    var building: Build?
    var buildStarted: Date?

    init(projectId: String) { self.projectId = projectId }

    var latest: Version? { detail?.versions.first }
    var canBuild: Bool { detail.map { $0.role == "owner" || $0.role == "editor" } ?? false }

    func load() async {
        do {
            detail = try await API.shared.project(projectId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func send(_ prompt: String) async {
        do {
            let id = try await API.shared.startBuild(projectId: projectId, prompt: prompt, baseVersionId: latest?.id)
            buildStarted = .now
            building = Build(id: id, status: "started", error: nil, version: nil)
            await load()
            await poll(id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Builds run on the server; check every 2 seconds until it finishes.
    /// Push notifications will replace this once APNs is wired up.
    private func poll(_ id: String) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2))
            guard let build = try? await API.shared.build(id) else { continue }
            building = build
            if build.status != "started" {
                if let message = build.error { error = message }
                building = nil
                await load()
                return
            }
        }
    }
}

struct StudioView: View {
    let name: String
    @State private var model: StudioModel
    @State private var prompt = ""
    @State private var reviewing: Version?
    @State private var sharing = false

    init(projectId: String, name: String) {
        self.name = name
        _model = State(initialValue: StudioModel(projectId: projectId))
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if let detail = model.detail {
                        ForEach(detail.messages) { message in
                            MessageRow(message: message, version: detail.versions.first { $0.id == message.versionId },
                                       live: detail.project.liveVersionId) { reviewing = $0 }
                        }
                        if detail.messages.isEmpty, let latest = model.latest {
                            VersionCard(version: latest, live: detail.project.liveVersionId == latest.id) { reviewing = latest }
                        }
                    }
                    if let build = model.building {
                        BuildProgressCard(build: build, started: model.buildStarted ?? .now)
                    }
                    if let error = model.error {
                        Text(error).font(.callout).foregroundStyle(.red)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(16)
            }
            .onChange(of: model.detail?.messages.count) { withAnimation { proxy.scrollTo("bottom") } }
        }
        .background(Theme.ground)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Share", systemImage: "square.and.arrow.up") { sharing = true }
                    .disabled(model.detail?.role != "owner")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.canBuild {
                Composer(text: $prompt, busy: model.building != nil) {
                    let text = prompt
                    prompt = ""
                    Task { await model.send(text) }
                }
            }
        }
        .fullScreenCover(item: $reviewing) { version in
            if let detail = model.detail {
                ReviewView(projectId: detail.project.id, version: version, canComment: detail.role != "viewer")
            }
        }
        .sheet(isPresented: $sharing) {
            if let detail = model.detail {
                ShareView(detail: detail) { Task { await model.load() } }
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

private struct MessageRow: View {
    let message: Message
    let version: Version?
    let live: String?
    let open: (Version) -> Void

    var body: some View {
        if message.role == "user" {
            Text(message.content)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .foregroundStyle(.white)
                .background(Theme.raspberry, in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20, bottomTrailingRadius: 6, topTrailingRadius: 20))
                .frame(maxWidth: 300, alignment: .trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else if let version {
            VersionCard(version: version, live: live == version.id) { open(version) }
        } else {
            Text(message.content).foregroundStyle(Theme.muted)
        }
    }
}

struct VersionCard: View {
    let version: Version
    let live: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Theme.raspberryTint)
                    .frame(width: 64, height: 84)
                    .overlay(Image(systemName: "play.fill").foregroundStyle(Theme.raspberry))
                VStack(alignment: .leading, spacing: 4) {
                    Text("VERSION \(version.number)\(live ? " · LIVE" : "")")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.raspberry)
                    Text(version.summary ?? "Version \(version.number)")
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                    Text("Open full screen").font(.footnote).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(Theme.card, in: .rect(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Theme.cardBorder))
        }
        .buttonStyle(.plain)
    }
}

private struct BuildProgressCard: View {
    let build: Build
    let started: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("BUILDING").font(.caption.weight(.semibold)).foregroundStyle(Theme.ember)
                Spacer()
                Text(started, style: .timer).font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
            }
            ProgressView().progressViewStyle(.linear).tint(Theme.ember)
            Text("You can leave. The build keeps going on the server.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
        }
        .padding(14)
        .background(Theme.card, in: .rect(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Theme.cardBorder))
    }
}

private struct Composer: View {
    @Binding var text: String
    let busy: Bool
    let send: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            TextField("Describe a change…", text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(.leading, 6)
            Button(action: send) {
                Image(systemName: "arrow.up").fontWeight(.bold)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.circle)
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send")
        }
        .padding(8)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }
}
