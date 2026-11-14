import SwiftUI

struct AccountView: View {
    @Environment(SessionModel.self) private var session
    @State private var me: Me?

    var body: some View {
        Form {
            Section {
                LabeledContent("Email", value: session.email ?? "—")
                if let quota = me?.quota {
                    LabeledContent("Plan", value: quota.plan.capitalized)
                    LabeledContent("Builds left this period", value: "\(quota.remaining) of \(quota.buildLimit)")
                }
            }
            Section {
                // Plan changes happen on the web for now; see "Billing" in the native apps plan.
                Link("Manage plan on realframe.app", destination: URL(string: "https://www.realframe.app/billing")!)
            }
            Section {
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
            }
        }
        .navigationTitle("Account")
        .task { me = try? await API.shared.me() }
    }
}
