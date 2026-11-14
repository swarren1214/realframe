import SwiftUI

@main
struct RealframeApp: App {
    @State private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(Theme.raspberry)
                .task { await session.start() }
        }
    }
}

struct RootView: View {
    @Environment(SessionModel.self) private var session

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.ground)
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabView()
        }
    }
}

/// Projects, Inbox and Account. On iOS 26 the tab bar picks up Liquid Glass on its own.
struct MainTabView: View {
    var body: some View {
        TabView {
            Tab("Projects", systemImage: "square.grid.2x2") {
                NavigationStack { ProjectsView() }
            }
            Tab("Inbox", systemImage: "bell") {
                NavigationStack { InboxPlaceholderView() }
            }
            Tab("Account", systemImage: "person.crop.circle") {
                NavigationStack { AccountView() }
            }
        }
    }
}

struct InboxPlaceholderView: View {
    var body: some View {
        ContentUnavailableView(
            "No activity yet",
            systemImage: "bell",
            description: Text("Replies, new comments and finished builds will show up here.")
        )
        .navigationTitle("Inbox")
    }
}
