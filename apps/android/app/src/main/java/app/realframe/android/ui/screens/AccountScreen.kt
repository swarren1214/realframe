package app.realframe.android.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import app.realframe.android.core.Api
import app.realframe.android.core.Me
import app.realframe.android.core.Supa
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.launch

@Composable
fun AccountScreen() {
    var me by remember { mutableStateOf<Me?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    LaunchedEffect(Unit) { me = runCatching { Api.me() }.getOrNull() }

    Column(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Account", style = MaterialTheme.typography.headlineLarge)
        ListItem(headlineContent = { Text("Email") }, supportingContent = { Text(me?.email ?: "—") })
        me?.quota?.let { q ->
            ListItem(headlineContent = { Text("Plan") }, supportingContent = { Text(q.plan.replaceFirstChar { it.uppercase() }) })
            ListItem(headlineContent = { Text("Builds left this period") }, supportingContent = { Text("${q.remaining} of ${q.buildLimit}") })
        }
        // Plan changes happen on the web for now; see "Billing" in the native apps plan.
        TextButton(onClick = {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.realframe.app/billing")))
        }) { Text("Manage plan on realframe.app") }
        OutlinedButton(onClick = { scope.launch { Supa.client.auth.signOut() } }) { Text("Sign out") }
    }
}

@Composable
fun InboxScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Notifications, contentDescription = null)
            Text("No activity yet", style = MaterialTheme.typography.titleMedium)
            Text(
                "Replies, new comments and finished builds will show up here.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 32.dp),
            )
        }
    }
}
