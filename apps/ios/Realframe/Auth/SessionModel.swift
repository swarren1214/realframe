import Foundation
import Observation
import Supabase

/// Tracks whether someone is signed in, from Supabase Auth's session events.
@MainActor
@Observable
final class SessionModel {
    enum State { case loading, signedOut, signedIn }

    private(set) var state: State = .loading
    private(set) var email: String?

    func start() async {
        for await (event, session) in Supa.auth.authStateChanges {
            switch event {
            case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                if let session, !session.isExpired {
                    email = session.user.email
                    state = .signedIn
                } else {
                    state = .signedOut
                }
            case .signedOut:
                email = nil
                state = .signedOut
            default:
                break
            }
        }
    }

    /// Emails a 6-digit code (and a magic link as a fallback).
    func sendCode(to email: String) async throws {
        try await Supa.auth.signInWithOTP(email: email, shouldCreateUser: true)
    }

    func verify(email: String, code: String) async throws {
        try await Supa.auth.verifyOTP(email: email, token: code, type: .email)
    }

    func signOut() async {
        try? await Supa.auth.signOut()
    }
}
