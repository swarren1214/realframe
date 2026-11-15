package app.realframe.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import app.realframe.android.ui.voice.Dictation
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.realframe.android.core.Api
import app.realframe.android.core.Message
import app.realframe.android.core.ProjectDetail
import app.realframe.android.core.Version
import app.realframe.android.ui.theme.Ember
import app.realframe.android.ui.theme.Raspberry
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudioScreen(
    projectId: String,
    name: String,
    back: () -> Unit,
    review: (Version, Boolean) -> Unit,
    share: () -> Unit,
) {
    var detail by remember { mutableStateOf<ProjectDetail?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var building by remember { mutableStateOf(false) }
    var prompt by remember { mutableStateOf("") }
    // Voice: spoken words land in the box; saying "send" sends.
    val context = LocalContext.current
    var listening by remember { mutableStateOf(false) }
    var heard by remember { mutableStateOf("") }
    var voiceError by remember { mutableStateOf<String?>(null) }
    var sendSpoken by remember { mutableStateOf(false) }
    val dictation = remember {
        Dictation(
            context,
            onPartial = { heard = it },
            onFinal = { spoken ->
                if (Dictation.isSend(spoken)) sendSpoken = true
                else prompt = Dictation.append(prompt, spoken)
            },
            onEnd = { err ->
                listening = false
                heard = ""
                voiceError = err
            },
        )
    }
    DisposableEffect(Unit) { onDispose { dictation.cancel() } }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            voiceError = null
            listening = true
            dictation.start()
        } else voiceError = "Allow the microphone for Realframe in Settings to talk instead of type."
    }
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()

    suspend fun load() {
        try {
            detail = Api.project(projectId)
            error = null
        } catch (e: Exception) {
            error = e.message
        }
    }
    LaunchedEffect(projectId) { load() }
    LaunchedEffect(detail?.messages?.size, building) {
        val count = list.layoutInfo.totalItemsCount
        if (count > 0) list.animateScrollToItem(count - 1)
    }

    fun send() {
        val text = prompt.trim()
        prompt = ""
        scope.launch {
            try {
                val buildId = Api.startBuild(projectId, text, detail?.versions?.firstOrNull()?.id)
                building = true
                load()
                // Builds run on the server; check every 2 s. Push (FCM) will replace this.
                while (true) {
                    delay(2000)
                    val build = runCatching { Api.build(buildId) }.getOrNull() ?: continue
                    if (build.status != "started") {
                        build.error?.let { error = it }
                        break
                    }
                }
            } catch (e: Exception) {
                error = e.message
            }
            building = false
            load()
        }
    }

    // "Send" said out loud sends what's in the box.
    LaunchedEffect(sendSpoken) {
        if (sendSpoken) {
            sendSpoken = false
            if (prompt.isNotBlank() && !building) send()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(name, style = MaterialTheme.typography.titleLarge)
                        detail?.versions?.firstOrNull()?.let {
                            Text("v${it.number}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    if (detail?.role == "owner") IconButton(onClick = share) { Icon(Icons.Outlined.Share, "Share") }
                },
            )
        },
        bottomBar = {
            if (detail?.canBuild == true) {
                Column(Modifier.fillMaxWidth()) {
                if (listening || voiceError != null) {
                    Text(
                        text = voiceError ?: heard.ifBlank { if (dictation.onDevice) "Listening on this phone…" else "Listening…" },
                        color = if (voiceError != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 3,
                        modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 8.dp),
                    )
                }
                Row(
                    Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    TextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        placeholder = { Text("Describe a change…") },
                        maxLines = 5,
                        shape = RoundedCornerShape(28.dp),
                        colors = TextFieldDefaults.colors(
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    if (dictation.available) {
                        IconButton(
                            onClick = {
                                if (listening) dictation.stop()
                                else askMic.launch(android.Manifest.permission.RECORD_AUDIO)
                            },
                            enabled = listening || !building,
                        ) {
                            Icon(
                                if (listening) Icons.Filled.Stop else Icons.Filled.Mic,
                                if (listening) "Stop listening" else "Talk instead of typing",
                                tint = if (listening) Raspberry else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    FilledIconButton(
                        onClick = ::send,
                        enabled = !building && prompt.isNotBlank(),
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier.size(56.dp),
                    ) { Icon(Icons.Filled.ArrowUpward, "Send") }
                }
                }
            }
        },
    ) { padding ->
        val d = detail
        LazyColumn(
            state = list,
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.padding(padding),
        ) {
            if (d != null) {
                items(d.messages, key = { it.id }) { message ->
                    MessageRow(message, d) { review(it, d.role != "viewer") }
                }
                if (d.messages.isEmpty()) {
                    d.versions.firstOrNull()?.let { v ->
                        item { VersionCard(v, d.project.liveVersionId == v.id) { review(v, d.role != "viewer") } }
                    }
                }
            }
            if (building) item { BuildCard() }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        }
    }
}

@Composable
private fun MessageRow(message: Message, detail: ProjectDetail, open: (Version) -> Unit) {
    val version = detail.versions.firstOrNull { it.id == message.versionId }
    when {
        message.role == "user" -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(
                message.content,
                color = Color.White,
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .background(Raspberry, RoundedCornerShape(24.dp, 24.dp, 8.dp, 24.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
        version != null -> VersionCard(version, detail.project.liveVersionId == version.id) { open(version) }
        else -> Text(message.content, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VersionCard(version: Version, live: Boolean, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(64.dp, 84.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Raspberry) }
            Spacer(Modifier.size(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "VERSION ${version.number}${if (live) " · LIVE" else ""}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = Raspberry,
                )
                Text(version.summary ?: "Version ${version.number}")
                Text("Open full screen", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun BuildCard() {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("BUILDING", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Ember)
            LinearProgressIndicator(color = Raspberry, modifier = Modifier.fillMaxWidth())
            Text(
                "You can leave. The build keeps going on the server.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
