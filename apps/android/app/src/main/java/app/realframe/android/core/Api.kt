package app.realframe.android.core

import app.realframe.android.BuildConfig
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Supabase handles sign-in and tokens. Data goes through [Api] (api.realframe.app/v1). */
object Supa {
    val client = createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY) {
        install(Auth)
    }
}

class ApiException(val status: Int, message: String, val code: String?) : Exception(message)

/** Talks to /v1 with the signed-in user's access token. See docs/api/openapi.yaml. */
object Api {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val http = HttpClient(OkHttp) {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    private val base = BuildConfig.API_BASE_URL.trimEnd('/')

    @Serializable private data class ErrorBody(val error: String? = null, val code: String? = null)
    @Serializable private data class ProjectsBody(val projects: List<ProjectSummary>)
    @Serializable private data class CreatedProject(val project: IdOnly)
    @Serializable private data class IdOnly(val id: String)
    @Serializable private data class BuildStarted(val buildId: String)
    @Serializable private data class ThreadsBody(val threads: List<CommentThread>)
    @Serializable private data class MembersBody(val members: List<Member>)
    @Serializable private data class NewThread(val versionId: String, val x: Double, val y: Double, val body: String)

    suspend fun me(): Me = get("me")
    suspend fun projects(): List<ProjectSummary> = get<ProjectsBody>("projects").projects
    suspend fun createProject(name: String): String =
        call<CreatedProject>(HttpMethod.Post, "projects", body = mapOf("name" to name)).project.id
    suspend fun project(id: String): ProjectDetail = get("projects/$id")

    suspend fun startBuild(projectId: String, prompt: String, baseVersionId: String?): String {
        val body = buildMap { put("prompt", prompt); baseVersionId?.let { put("baseVersionId", it) } }
        return call<BuildStarted>(HttpMethod.Post, "projects/$projectId/builds", body = body).buildId
    }

    suspend fun build(id: String): Build = get("builds/$id")

    suspend fun threads(projectId: String, versionId: String): List<CommentThread> =
        get<ThreadsBody>("projects/$projectId/threads", mapOf("versionId" to versionId)).threads

    suspend fun createThread(projectId: String, versionId: String, x: Double, y: Double, body: String) {
        send(HttpMethod.Post, "projects/$projectId/threads", body = NewThread(versionId, x, y, body))
    }

    suspend fun reply(threadId: String, body: String) =
        send(HttpMethod.Post, "threads/$threadId/comments", body = mapOf("body" to body))

    suspend fun setThread(threadId: String, resolved: Boolean) =
        send(HttpMethod.Patch, "threads/$threadId", body = mapOf("status" to if (resolved) "resolved" else "open"))

    suspend fun publish(projectId: String, versionId: String) =
        send(HttpMethod.Post, "projects/$projectId/publish", body = mapOf("versionId" to versionId))

    suspend fun setAccess(projectId: String, mode: String) =
        send(HttpMethod.Put, "projects/$projectId/access", body = mapOf("mode" to mode))

    suspend fun members(projectId: String): List<Member> = get<MembersBody>("projects/$projectId/members").members

    suspend fun invite(projectId: String, email: String, role: String) =
        send(HttpMethod.Post, "projects/$projectId/members", body = mapOf("email" to email, "role" to role))

    suspend fun removeMember(projectId: String, email: String) =
        send(HttpMethod.Delete, "projects/$projectId/members", query = mapOf("email" to email))

    /** The version's HTML with the pin agent injected, for the review WebView. */
    suspend fun document(versionId: String): String = raw(HttpMethod.Get, "versions/$versionId/document").bodyAsText()

    // Plumbing

    private suspend inline fun <reified T> get(path: String, query: Map<String, String> = emptyMap()): T =
        call(HttpMethod.Get, path, query)

    private suspend inline fun <reified T> call(
        method: HttpMethod,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: Any? = null,
    ): T = json.decodeFromString(raw(method, path, query, body).bodyAsText())

    private suspend fun send(method: HttpMethod, path: String, query: Map<String, String> = emptyMap(), body: Any? = null) {
        raw(method, path, query, body)
    }

    private suspend fun raw(
        method: HttpMethod,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: Any? = null,
    ): HttpResponse {
        val token = Supa.client.auth.currentAccessTokenOrNull()
            ?: throw ApiException(401, "Sign in first.", "unauthenticated")
        val response = http.request("$base/$path") {
            this.method = method
            bearerAuth(token)
            query.forEach { (k, v) -> parameter(k, v) }
            if (body != null) jsonBody(body)
        }
        if (!response.status.isSuccess()) {
            val e = runCatching { json.decodeFromString<ErrorBody>(response.bodyAsText()) }.getOrNull()
            throw ApiException(response.status.value, e?.error ?: "Something went wrong (${response.status.value}).", e?.code)
        }
        return response
    }

    private fun HttpRequestBuilder.jsonBody(body: Any) {
        contentType(ContentType.Application.Json)
        @Suppress("UNCHECKED_CAST")
        when (body) {
            is NewThread -> setBody(body)
            is Map<*, *> -> setBody(body as Map<String, String>)
            else -> error("Unsupported body type")
        }
    }
}
