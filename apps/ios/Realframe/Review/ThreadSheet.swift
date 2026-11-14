import SwiftUI

struct ThreadSheet: View {
    let thread: CommentThread
    let number: Int
    let changed: () async -> Void

    @State private var reply = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pin \(number)").font(Theme.display(20))
                    Text(thread.isOpen ? "Open" : "Resolved").font(.footnote).foregroundStyle(Theme.muted)
                }
                Spacer()
                Button(thread.isOpen ? "Resolve" : "Reopen", systemImage: thread.isOpen ? "checkmark" : "arrow.uturn.backward") {
                    run { try await API.shared.setThread(thread.id, resolved: thread.isOpen) }
                }
                .buttonStyle(.glassProminent)
                .disabled(busy)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(thread.comments) { comment in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(Theme.raspberry.opacity(0.15))
                                .frame(width: 32, height: 32)
                                .overlay(Text(comment.author.prefix(1).uppercased()).font(.footnote.bold()).foregroundStyle(Theme.raspberry))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 4) {
                                    Text(comment.author).fontWeight(.semibold)
                                    Text("· \(comment.createdAt, format: .relative(presentation: .named))").foregroundStyle(Theme.muted)
                                }
                                .font(.subheadline)
                                Text(comment.body)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error { Text(error).font(.footnote).foregroundStyle(.red) }

            HStack(spacing: 8) {
                TextField("Reply…", text: $reply, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(.leading, 8)
                Button {
                    let text = reply.trimmingCharacters(in: .whitespacesAndNewlines)
                    run {
                        try await API.shared.reply(threadId: thread.id, body: text)
                        reply = ""
                    }
                } label: {
                    Image(systemName: "arrow.up").fontWeight(.bold)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .disabled(busy || reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send reply")
            }
            .padding(6)
            .glassEffect(.regular, in: .capsule)
        }
        .padding(20)
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do {
                try await work()
                await changed()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
