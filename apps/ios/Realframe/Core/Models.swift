import Foundation

// Shapes returned by /v1 (see docs/api/openapi.yaml).

struct Me: Decodable, Sendable {
    let id: String
    let email: String?
    let quota: Quota?

    struct Quota: Decodable, Sendable {
        let plan: String
        let buildLimit: Int
        let used: Int
        let remaining: Int
    }
}

struct ProjectSummary: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let slug: String
    let role: String
    let accessMode: String
    let published: Bool
    let liveVersion: Int?
    let latestVersion: Int?
    let openThreads: Int
    let updatedAt: Date

    var canBuild: Bool { role == "owner" || role == "editor" }
}

struct ProjectDetail: Decodable, Sendable {
    let role: String
    let project: Project
    let versions: [Version]
    let messages: [Message]

    struct Project: Decodable, Sendable {
        let id: String
        let name: String
        let slug: String
        let accessMode: String
        let published: Bool
        let liveVersionId: String?
        let hasPassword: Bool?
    }
}

struct Version: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let number: Int
    let summary: String?
    let prompt: String?
    let source: String
    let kind: String
    let createdAt: Date
}

struct Message: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let role: String
    let content: String
    let versionId: String?
    let createdAt: Date
}

struct Build: Decodable, Sendable {
    let id: String
    let status: String
    let error: String?
    let version: BuildVersion?

    struct BuildVersion: Decodable, Sendable {
        let id: String
        let number: Int
        let summary: String?
    }
}

struct CommentThread: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let versionId: String
    let x: Double
    let y: Double
    let status: String
    let createdAt: Date
    let comments: [Comment]

    var isOpen: Bool { status == "open" }
}

struct Comment: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let authorEmail: String
    let authorName: String?
    let body: String
    let createdAt: Date

    var author: String {
        if let name = authorName?.trimmingCharacters(in: .whitespaces), !name.isEmpty { return name }
        return authorEmail.split(separator: "@").first.map(String.init) ?? authorEmail
    }
}

struct Member: Decodable, Identifiable, Hashable, Sendable {
    let email: String
    let role: String
    let userId: String?
    var id: String { email }
}
