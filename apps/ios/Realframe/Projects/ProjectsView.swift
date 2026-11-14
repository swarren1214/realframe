import SwiftUI

struct ProjectsView: View {
    enum Filter: String, CaseIterable { case all = "All", mine = "Mine", shared = "Shared with me" }

    @State private var projects: [ProjectSummary] = []
    @State private var filter: Filter = .all
    @State private var search = ""
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false

    private var visible: [ProjectSummary] {
        projects.filter { p in
            let matchesFilter = switch filter {
            case .all: true
            case .mine: p.role == "owner"
            case .shared: p.role != "owner"
            }
            return matchesFilter && (search.isEmpty || p.name.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Filter", selection: $filter) {
                    ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                if let error {
                    Text(error).foregroundStyle(.red).font(.callout)
                }

                LazyVStack(spacing: 12) {
                    ForEach(visible) { project in
                        NavigationLink(value: project) { ProjectCard(project: project) }
                            .buttonStyle(.plain)
                    }
                }

                if !loading && visible.isEmpty {
                    ContentUnavailableView(
                        "No prototypes yet",
                        systemImage: "rectangle.on.rectangle",
                        description: Text("Tap + to describe your first one.")
                    )
                    .padding(.top, 40)
                }
            }
            .padding(.horizontal, 20)
        }
        .background(Theme.ground)
        .navigationTitle("Projects")
        .searchable(text: $search, prompt: "Search projects")
        .navigationDestination(for: ProjectSummary.self) { StudioView(projectId: $0.id, name: $0.name) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New prototype", systemImage: "plus") { creating = true }
                    .buttonStyle(.glassProminent)
            }
        }
        .sheet(isPresented: $creating) {
            NewProjectSheet { await load() }
                .presentationDetents([.medium])
        }
        .refreshable { await load() }
        .task { await load() }
        .overlay { if loading && projects.isEmpty { ProgressView() } }
    }

    private func load() async {
        do {
            projects = try await API.shared.projects()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct ProjectCard: View {
    let project: ProjectSummary

    private var status: (String, Color) {
        if !project.published { return ("Draft", Theme.muted) }
        switch project.accessMode {
        case "password": return ("Password", .indigo)
        case "public": return ("Public", Theme.success)
        default: return ("Published", Theme.raspberry)
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Theme.raspberryTint)
                .frame(width: 64, height: 84)
                .overlay(Image(systemName: "iphone").foregroundStyle(Theme.raspberry))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(project.name).font(.headline).foregroundStyle(Theme.ink)
                HStack(spacing: 8) {
                    StatusPill(text: status.0, tint: status.1)
                    if let v = project.latestVersion {
                        Text("v\(v) · \(project.updatedAt, format: .relative(presentation: .named))")
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                    }
                }
                if project.openThreads > 0 {
                    Label("\(project.openThreads) open", systemImage: "bubble.left")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.raspberry)
                }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(Theme.card, in: .rect(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Theme.cardBorder))
    }
}

/// Names the new prototype; the first prompt is written in the studio.
struct NewProjectSheet: View {
    var onCreated: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("New prototype")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        busy = true
                        Task {
                            do {
                                _ = try await API.shared.createProject(name: name)
                                await onCreated()
                                dismiss()
                            } catch {
                                self.error = error.localizedDescription
                            }
                            busy = false
                        }
                    }
                    .disabled(busy)
                }
            }
        }
    }
}
