import Foundation
import Supabase

/// Supabase is used for sign-in and tokens. Data goes through `API` (api.realframe.app/v1).
enum Supa {
    static let client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseKey)
    static var auth: AuthClient { client.auth }
}

struct APIError: LocalizedError, Sendable {
    let status: Int
    let message: String
    let code: String?
    var errorDescription: String? { message }
}

/// Talks to api.realframe.app/v1 with the signed-in user's access token.
struct API: Sendable {
    static let shared = API()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = parseTimestamp(raw) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(raw)"))
        }
        return d
    }()

    // MARK: Endpoints

    func me() async throws -> Me { try await get("me") }

    func projects() async throws -> [ProjectSummary] {
        struct R: Decodable { let projects: [ProjectSummary] }
        let r: R = try await get("projects")
        return r.projects
    }

    func createProject(name: String) async throws -> String {
        struct R: Decodable { struct P: Decodable { let id: String }; let project: P }
        let r: R = try await send("POST", "projects", body: ["name": name])
        return r.project.id
    }

    func project(_ id: String) async throws -> ProjectDetail { try await get("projects/\(id)") }

    func startBuild(projectId: String, prompt: String, baseVersionId: String? = nil) async throws -> String {
        struct R: Decodable { let buildId: String }
        var body: [String: String] = ["prompt": prompt]
        if let baseVersionId { body["baseVersionId"] = baseVersionId }
        let r: R = try await send("POST", "projects/\(projectId)/builds", body: body)
        return r.buildId
    }

    func build(_ id: String) async throws -> Build { try await get("builds/\(id)") }

    func threads(projectId: String, versionId: String) async throws -> [CommentThread] {
        struct R: Decodable { let threads: [CommentThread] }
        let r: R = try await get("projects/\(projectId)/threads", query: ["versionId": versionId])
        return r.threads
    }

    func createThread(projectId: String, versionId: String, x: Double, y: Double, body: String) async throws {
        struct B: Encodable { let versionId: String; let x: Double; let y: Double; let body: String }
        let _: Empty = try await send("POST", "projects/\(projectId)/threads", body: B(versionId: versionId, x: x, y: y, body: body))
    }

    func reply(threadId: String, body: String) async throws {
        let _: Empty = try await send("POST", "threads/\(threadId)/comments", body: ["body": body])
    }

    func setThread(_ threadId: String, resolved: Bool) async throws {
        let _: Empty = try await send("PATCH", "threads/\(threadId)", body: ["status": resolved ? "resolved" : "open"])
    }

    func publish(projectId: String, versionId: String) async throws {
        let _: Empty = try await send("POST", "projects/\(projectId)/publish", body: ["versionId": versionId])
    }

    func setAccess(projectId: String, mode: String) async throws {
        let _: Empty = try await send("PUT", "projects/\(projectId)/access", body: ["mode": mode])
    }

    func members(projectId: String) async throws -> [Member] {
        struct R: Decodable { let members: [Member] }
        let r: R = try await get("projects/\(projectId)/members")
        return r.members
    }

    func invite(projectId: String, email: String, role: String) async throws {
        let _: Empty = try await send("POST", "projects/\(projectId)/members", body: ["email": email, "role": role])
    }

    func removeMember(projectId: String, email: String) async throws {
        let _: Empty = try await send("DELETE", "projects/\(projectId)/members", query: ["email": email], body: Optional<String>.none)
    }

    /// The version's HTML with the pin agent injected, for PrototypeView.
    func document(versionId: String) async throws -> String {
        let data = try await raw("GET", "versions/\(versionId)/document", query: [:], body: nil)
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: Plumbing

    private struct Empty: Decodable {}

    private func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        try await decode(raw("GET", path, query: query, body: nil))
    }

    private func send<T: Decodable, B: Encodable>(_ method: String, _ path: String, query: [String: String] = [:], body: B?) async throws -> T {
        let data = try body.map { try JSONEncoder().encode($0) }
        return try await decode(raw(method, path, query: query, body: data))
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        if T.self == Empty.self { return Empty() as! T }
        return try Self.decoder.decode(T.self, from: data)
    }

    private func raw(_ method: String, _ path: String, query: [String: String], body: Data?) async throws -> Data {
        var components = URLComponents(url: Config.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        let token = try await Supa.auth.session.accessToken
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            struct E: Decodable { let error: String?; let code: String? }
            let e = try? JSONDecoder().decode(E.self, from: data)
            throw APIError(status: status, message: e?.error ?? "Something went wrong (\(status)).", code: e?.code)
        }
        return data
    }
}

/// Postgres timestamps carry up to 6 fractional digits; Foundation's parser wants 0 or 3.
func parseTimestamp(_ raw: String) -> Date? {
    var s = raw.replacingOccurrences(of: " ", with: "T")
    if let dot = s.firstIndex(of: ".") {
        let after = s[s.index(after: dot)...]
        let digits = after.prefix { $0.isNumber }
        let zone = after.dropFirst(digits.count)
        s = String(s[..<dot]) + "." + String(digits.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0) + zone
    }
    if s.hasSuffix("+00:00") { s = String(s.dropLast(6)) + "Z" }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: s) { return d }
    let plain = ISO8601DateFormatter()
    return plain.date(from: s)
}
