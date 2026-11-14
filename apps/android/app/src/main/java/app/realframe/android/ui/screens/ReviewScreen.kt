package app.realframe.android.ui.screens

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.PinDrop
import androidx.compose.material.icons.outlined.TouchApp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import app.realframe.android.core.Api
import app.realframe.android.core.CommentThread
import app.realframe.android.ui.theme.Raspberry
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

@Serializable
private data class AgentPin(val id: String, val n: Int, val x: Double, val y: Double, val status: String, val selected: Boolean)

private sealed interface AgentEvent {
    data object Ready : AgentEvent
    data class Pick(val x: Double, val y: Double) : AgentEvent
    data class Select(val threadId: String) : AgentEvent
}

/**
 * Receives the pin agent's messages. Registered as `window.RealframeAndroid`, which the
 * bridge in /v1/versions/:id/document calls. Only these strings cross; nothing else is exposed.
 */
private class AgentBridge(private val onEvent: (AgentEvent) -> Unit) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun post(raw: String) {
        val m = runCatching { Api.json.decodeFromString(JsonObject.serializer(), raw) }.getOrNull() ?: return
        val event = when (m["type"]?.jsonPrimitive?.contentOrNull) {
            "rf:ready" -> AgentEvent.Ready
            "rf:pick" -> {
                val x = m["x"]?.jsonPrimitive?.doubleOrNull ?: return
                val y = m["y"]?.jsonPrimitive?.doubleOrNull ?: return
                AgentEvent.Pick(x, y)
            }
            "rf:select" -> AgentEvent.Select(m["id"]?.jsonPrimitive?.contentOrNull ?: return)
            else -> return
        }
        main.post { onEvent(event) }
    }
}

/** Full-screen prototype with pinned comments. Browse to use it; switch to Comment to drop a pin. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(projectId: String, versionId: String, number: Int, canComment: Boolean, close: () -> Unit) {
    var html by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var threads by remember { mutableStateOf<List<CommentThread>>(emptyList()) }
    var commentMode by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var ready by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun loadThreads() {
        threads = runCatching { Api.threads(projectId, versionId) }.getOrDefault(threads)
    }

    LaunchedEffect(versionId) {
        try {
            html = Api.document(versionId)
        } catch (e: Exception) {
            error = e.message
        }
        loadThreads()
    }

    // Keep the agent's mode and pins in step with ours.
    LaunchedEffect(ready, commentMode, threads, selectedId) {
        val view = webView ?: return@LaunchedEffect
        if (!ready) return@LaunchedEffect
        val pins = threads.mapIndexed { i, t -> AgentPin(t.id, i + 1, t.x, t.y, t.status, t.id == selectedId) }
        val pinsJson = Api.json.encodeToString(kotlinx.serialization.builtins.ListSerializer(AgentPin.serializer()), pins)
        view.evaluateJavascript("window.postMessage({type:'rf:mode',on:$commentMode},'*')", null)
        view.evaluateJavascript("window.postMessage({type:'rf:pins',pins:$pinsJson},'*')", null)
    }

    Box(Modifier.fillMaxSize().background(Color.White)) {
        val doc = html
        when {
            doc != null -> PrototypeWebView(doc, onCreated = { webView = it }) { event ->
                when (event) {
                    AgentEvent.Ready -> ready = true
                    is AgentEvent.Pick -> draft = event.x to event.y
                    is AgentEvent.Select -> selectedId = event.threadId
                }
            }
            error != null -> Text(error!!, modifier = Modifier.align(Alignment.Center).padding(24.dp))
            else -> CircularProgressIndicator(Modifier.align(Alignment.Center))
        }

        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                IconButton(onClick = close) { Icon(Icons.Filled.Close, "Close review") }
            }
            Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = null, tint = Raspberry, modifier = Modifier.size(18.dp))
                    Text("${threads.count { it.isOpen }} open · v$number")
                }
            }
        }

        if (canComment) {
            // Floating toolbar: Browse / Comment.
            Surface(
                shape = RoundedCornerShape(32.dp),
                color = Color(0xFF3B2A30),
                shadowElevation = 6.dp,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 24.dp),
            ) {
                Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ModeButton("Browse", Icons.Outlined.TouchApp, !commentMode) { commentMode = false }
                    ModeButton("Comment", Icons.Outlined.PinDrop, commentMode) { commentMode = true }
                }
            }
        }
    }

    threads.firstOrNull { it.id == selectedId }?.let { thread ->
        ModalBottomSheet(onDismissRequest = { selectedId = null }) {
            ThreadSheet(thread, threads.indexOf(thread) + 1) { scope.launch { loadThreads() } }
        }
    }

    draft?.let { (x, y) ->
        ModalBottomSheet(onDismissRequest = { draft = null }) {
            Composer("New comment", "What should change here?") { text ->
                Api.createThread(projectId, versionId, x, y, text)
                draft = null
                commentMode = false
                loadThreads()
            }
        }
    }
}

@Composable
private fun ModeButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        FilledTonalButton(onClick = onClick, shape = RoundedCornerShape(16.dp)) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Text("  $label")
        }
    } else {
        IconButton(onClick = onClick) { Icon(icon, contentDescription = label, tint = Color(0xFFF2DDE2)) }
    }
}

/**
 * The prototype runs from a data load with no base URL (origin "null"), no file or content
 * access, and only the AgentBridge exposed, so its code can't reach the app or its session.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PrototypeWebView(html: String, onCreated: (WebView) -> Unit, onEvent: (AgentEvent) -> Unit) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                addJavascriptInterface(AgentBridge(onEvent), "RealframeAndroid")
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        view.evaluateJavascript("window.postMessage({type:'rf:ping'},'*')", null)
                    }

                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val url = request.url
                        if (url.scheme == "http" || url.scheme == "https") {
                            if (request.hasGesture()) context.startActivity(Intent(Intent.ACTION_VIEW, url))
                            return true
                        }
                        return url.scheme != "about" && url.scheme != "data"
                    }
                }
                loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
                onCreated(this)
            }
        },
    )
}

@Composable
private fun ThreadSheet(thread: CommentThread, number: Int, changed: () -> Unit) {
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Pin $number", style = MaterialTheme.typography.headlineSmall)
                Text(if (thread.isOpen) "Open" else "Resolved", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = {
                scope.launch {
                    runCatching { Api.setThread(thread.id, resolved = thread.isOpen) }.onFailure { error = it.message }
                    changed()
                }
            }) {
                Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(if (thread.isOpen) "  Resolve" else "  Reopen")
            }
        }
        LazyColumn(Modifier.heightIn(max = 320.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(thread.comments, key = { it.id }) { c ->
                Column {
                    Text(c.author, style = MaterialTheme.typography.titleSmall)
                    Text(c.body)
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Composer(null, "Reply…") { text ->
            Api.reply(thread.id, text)
            changed()
        }
    }
}

@Composable
private fun Composer(title: String?, placeholder: String, submit: suspend (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().padding(horizontal = if (title != null) 20.dp else 0.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        title?.let { Text(it, style = MaterialTheme.typography.titleLarge) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(placeholder) },
                maxLines = 5,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.weight(1f),
            )
            FilledIconButton(
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            submit(text.trim())
                            text = ""
                        } catch (e: Exception) {
                            error = e.message
                        }
                        busy = false
                    }
                },
                enabled = !busy && text.isNotBlank(),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.size(52.dp),
            ) { Icon(Icons.Filled.ArrowUpward, "Send") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
