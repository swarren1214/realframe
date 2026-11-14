import SwiftUI

/// The review link, the live version, who can open it, and who's invited. Owners only.
struct ShareView: View {
    let detail: ProjectDetail
    let changed: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var access: String
    @State private var members: [Member] = []
    @State private var inviteEmail = ""
    @State private var inviteRole = "commenter"
    @State private var error: String?

    init(detail: ProjectDetail, changed: @escaping () -> Void) {
        self.detail = detail
        self.changed = changed
        _access = State(initialValue: detail.project.accessMode)
    }

    private var link: URL { Config.reviewURL(slug: detail.project.slug) }
    private var liveNumber: Int? { detail.versions.first { $0.id == detail.project.liveVersionId }?.number }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(link.host() ?? link.absoluteString, systemImage: "link")
                        .foregroundStyle(Theme.raspberry)
                        .font(.body.weight(.semibold))
                    HStack {
                        Button("Copy link", systemImage: "doc.on.doc") { UIPasteboard.general.url = link }
                        Spacer()
                        ShareLink(item: link)
                    }
                    if detail.project.published, let liveNumber {
                        LabeledContent("Live version", value: "\(liveNumber)")
                    } else {
                        Text("Not published yet").foregroundStyle(Theme.muted)
                    }
                    if let latest = detail.versions.first, latest.id != detail.project.liveVersionId {
                        Button("Publish version \(latest.number)") {
                            run { try await API.shared.publish(projectId: detail.project.id, versionId: latest.id) }
                        }
                    }
                }

                Section("Who can open it") {
                    Picker("Access", selection: $access) {
                        Text("Invite only").tag("invite")
                        Text("Password").tag("password")
                        Text("Anyone").tag("public")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: access) { _, mode in
                        run { try await API.shared.setAccess(projectId: detail.project.id, mode: mode) }
                    }
                    if access == "password" && detail.project.hasPassword != true {
                        Text("Set a password on realframe.app first.").font(.footnote).foregroundStyle(Theme.muted)
                    }
                }

                Section("People") {
                    HStack {
                        TextField("Add people by email", text: $inviteEmail)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        Picker("Role", selection: $inviteRole) {
                            Text("Viewer").tag("viewer")
                            Text("Commenter").tag("commenter")
                            Text("Editor").tag("editor")
                        }
                        .labelsHidden()
                    }
                    Button("Invite") {
                        let email = inviteEmail
                        run {
                            try await API.shared.invite(projectId: detail.project.id, email: email, role: inviteRole)
                            inviteEmail = ""
                        }
                    }
                    .disabled(!inviteEmail.contains("@"))

                    ForEach(members) { member in
                        LabeledContent(member.email, value: member.role.capitalized)
                            .swipeActions {
                                Button("Remove", role: .destructive) {
                                    run { try await API.shared.removeMember(projectId: detail.project.id, email: member.email) }
                                }
                            }
                    }
                }

                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { await loadMembers() }
        }
    }

    private func loadMembers() async {
        members = (try? await API.shared.members(projectId: detail.project.id)) ?? []
    }

    private func run(_ work: @escaping () async throws -> Void) {
        error = nil
        Task {
            do {
                try await work()
                await loadMembers()
                changed()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
