package app.realframe.android.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shapes returned by /v1 (see docs/api/openapi.yaml). Timestamps stay ISO strings.

@Serializable
data class Me(val id: String, val email: String? = null, val quota: Quota? = null) {
    @Serializable
    data class Quota(
        val plan: String,
        @SerialName("build_limit") val buildLimit: Int,
        val used: Int,
        val remaining: Int,
    )
}

@Serializable
data class ProjectSummary(
    val id: String,
    val name: String,
    val slug: String,
    val role: String,
    val accessMode: String,
    val published: Boolean,
    val liveVersion: Int? = null,
    val latestVersion: Int? = null,
    val openThreads: Int = 0,
    val updatedAt: String,
)

@Serializable
data class ProjectDetail(
    val role: String,
    val project: Project,
    val versions: List<Version>,
    val messages: List<Message>,
) {
    @Serializable
    data class Project(
        val id: String,
        val name: String,
        val slug: String,
        @SerialName("access_mode") val accessMode: String,
        val published: Boolean,
        @SerialName("live_version_id") val liveVersionId: String? = null,
        @SerialName("has_password") val hasPassword: Boolean? = null,
    )

    val canBuild get() = role == "owner" || role == "editor"
}

@Serializable
data class Version(
    val id: String,
    val number: Int,
    val summary: String? = null,
    val prompt: String? = null,
    val source: String,
    val kind: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class Message(
    val id: String,
    val role: String,
    val content: String,
    @SerialName("version_id") val versionId: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class Build(val id: String, val status: String, val error: String? = null, val version: BuildVersion? = null) {
    @Serializable
    data class BuildVersion(val id: String, val number: Int, val summary: String? = null)
}

@Serializable
data class CommentThread(
    val id: String,
    @SerialName("version_id") val versionId: String,
    val x: Double,
    val y: Double,
    val status: String,
    @SerialName("created_at") val createdAt: String,
    val comments: List<Comment> = emptyList(),
) {
    val isOpen get() = status == "open"
}

@Serializable
data class Comment(
    val id: String,
    @SerialName("author_email") val authorEmail: String,
    @SerialName("author_name") val authorName: String? = null,
    val body: String,
    @SerialName("created_at") val createdAt: String,
) {
    val author get() = authorName?.takeIf { it.isNotBlank() } ?: authorEmail.substringBefore("@")
}

@Serializable
data class Member(
    val email: String,
    val role: String,
    @SerialName("user_id") val userId: String? = null,
)
