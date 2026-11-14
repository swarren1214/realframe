import SwiftUI

/// Email + one-time code, so nobody has to leave the app to tap a link.
struct SignInView: View {
    @Environment(SessionModel.self) private var session
    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Text("Realframe")
                .font(Theme.display(40))
                .foregroundStyle(Theme.ink)
            Text(codeSent ? "We sent a 6-digit code to \(email)." : "Review and build prototypes from your phone.")
                .font(.title3)
                .foregroundStyle(Theme.muted)

            if codeSent {
                TextField("123456", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .padding()
                    .background(Theme.card, in: .rect(cornerRadius: 16))
                    .accessibilityLabel("Sign-in code")
            } else {
                TextField("you@company.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Theme.card, in: .rect(cornerRadius: 16))
                    .accessibilityLabel("Email")
            }

            if let error {
                Text(error).font(.callout).foregroundStyle(.red)
            }

            Button(action: submit) {
                HStack {
                    if busy { ProgressView().tint(.white) }
                    Text(codeSent ? "Sign in" : "Email me a code").fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, minHeight: 32)
            }
            .buttonStyle(.glassProminent)
            .disabled(busy || (codeSent ? code.count < 6 : !email.contains("@")))

            if codeSent {
                Button("Use a different email") {
                    codeSent = false
                    code = ""
                }
                .frame(maxWidth: .infinity)
            }
            Spacer()
        }
        .padding(24)
        .background(Theme.ground)
    }

    private func submit() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                if codeSent {
                    try await session.verify(email: email.trimmingCharacters(in: .whitespaces), code: code)
                } else {
                    try await session.sendCode(to: email.trimmingCharacters(in: .whitespaces).lowercased())
                    codeSent = true
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
