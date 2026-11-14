package app.realframe.android.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.realframe.android.BuildConfig
import app.realframe.android.core.Api
import app.realframe.android.core.Member
import app.realframe.android.core.ProjectDetail
import kotlinx.coroutines.launch

private val accessModes = listOf("invite" to "Invite", "password" to "Password", "public" to "Anyone")
private val roles = listOf("viewer", "commenter", "editor")

/** The review link, the live version, who can open it, and who's invited. Owners only. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareScreen(projectId: String, close: () -> Unit) {
    var detail by remember { mutableStateOf<ProjectDetail?>(null) }
    var members by remember { mutableStateOf<List<Member>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("commenter") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun load() {
        try {
            detail = Api.project(projectId)
            members = Api.members(projectId)
        } catch (e: Exception) {
            error = e.message
        }
    }
    LaunchedEffect(projectId) { load() }

    fun run(work: suspend () -> Unit) {
        error = null
        scope.launch {
            try {
                work()
            } catch (e: Exception) {
                error = e.message
            }
            load()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Share") },
                navigationIcon = { IconButton(onClick = close) { Icon(Icons.Filled.Close, "Close") } },
            )
        },
    ) { padding ->
        val d = detail ?: return@Scaffold
        val link = "https://${d.project.slug}.${BuildConfig.REVIEW_DOMAIN}"
        Column(
            Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Link, contentDescription = null)
                        Text("  ${link.removePrefix("https://")}", fontWeight = FontWeight.SemiBold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Review link", link))
                        }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Outlined.ContentCopy, contentDescription = null)
                            Text("  Copy link")
                        }
                        OutlinedButton(onClick = {
                            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link)
                            context.startActivity(Intent.createChooser(send, null))
                        }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Outlined.Share, contentDescription = null)
                            Text("  Share")
                        }
                    }
                    val live = d.versions.firstOrNull { it.id == d.project.liveVersionId }
                    Text(if (d.project.published && live != null) "Live version: ${live.number}" else "Not published yet")
                    d.versions.firstOrNull()?.takeIf { it.id != d.project.liveVersionId }?.let { latest ->
                        OutlinedButton(onClick = { run { Api.publish(projectId, latest.id) } }) {
                            Text("Publish version ${latest.number}")
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Who can open it", style = MaterialTheme.typography.titleSmall)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    accessModes.forEachIndexed { i, (mode, label) ->
                        SegmentedButton(
                            selected = d.project.accessMode == mode,
                            onClick = { run { Api.setAccess(projectId, mode) } },
                            shape = SegmentedButtonDefaults.itemShape(i, accessModes.size),
                        ) { Text(label) }
                    }
                }
            }

            Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Add people by email") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        roles.forEachIndexed { i, r ->
                            SegmentedButton(
                                selected = role == r,
                                onClick = { role = r },
                                shape = SegmentedButtonDefaults.itemShape(i, roles.size),
                            ) { Text(r.replaceFirstChar { it.uppercase() }) }
                        }
                    }
                    Button(onClick = { run { Api.invite(projectId, email.trim(), role); email = "" } }, enabled = "@" in email) {
                        Text("Invite")
                    }
                    members.forEach { m ->
                        ListItem(
                            headlineContent = { Text(m.email) },
                            supportingContent = { Text(m.role.replaceFirstChar { it.uppercase() }) },
                            trailingContent = {
                                IconButton(onClick = { run { Api.removeMember(projectId, m.email) } }) {
                                    Icon(Icons.Outlined.Delete, "Remove ${m.email}")
                                }
                            },
                        )
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
