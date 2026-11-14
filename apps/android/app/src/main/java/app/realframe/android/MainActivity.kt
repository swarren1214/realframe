package app.realframe.android

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.realframe.android.core.Supa
import app.realframe.android.ui.screens.AccountScreen
import app.realframe.android.ui.screens.InboxScreen
import app.realframe.android.ui.screens.ProjectsScreen
import app.realframe.android.ui.screens.ReviewScreen
import app.realframe.android.ui.screens.ShareScreen
import app.realframe.android.ui.screens.SignInScreen
import app.realframe.android.ui.screens.StudioScreen
import app.realframe.android.ui.theme.RealframeTheme
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RealframeTheme {
                val status by Supa.client.auth.sessionStatus.collectAsState()
                when (status) {
                    is SessionStatus.Authenticated -> RealframeNav()
                    is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    else -> SignInScreen()
                }
            }
        }
    }
}

private data class TopLevel(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TopLevel("projects", "Projects", Icons.Outlined.GridView),
    TopLevel("inbox", "Inbox", Icons.Outlined.Notifications),
    TopLevel("account", "Account", Icons.Outlined.AccountCircle),
)

@Composable
private fun RealframeNav() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val showBar = tabs.any { it.route == route }

    Scaffold(
        bottomBar = {
            if (showBar) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo("projects") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "projects", modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            composable("projects") {
                ProjectsScreen(open = { p -> nav.navigate("studio/${p.id}/${Uri.encode(p.name)}") })
            }
            composable("inbox") { InboxScreen() }
            composable("account") { AccountScreen() }
            composable(
                "studio/{id}/{name}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }, navArgument("name") { type = NavType.StringType }),
            ) { back ->
                val id = back.arguments?.getString("id")!!
                StudioScreen(
                    projectId = id,
                    name = back.arguments?.getString("name").orEmpty(),
                    back = { nav.popBackStack() },
                    review = { version, canComment -> nav.navigate("review/$id/${version.id}/${version.number}/$canComment") },
                    share = { nav.navigate("share/$id") },
                )
            }
            composable(
                "review/{projectId}/{versionId}/{number}/{canComment}",
                arguments = listOf(
                    navArgument("projectId") { type = NavType.StringType },
                    navArgument("versionId") { type = NavType.StringType },
                    navArgument("number") { type = NavType.IntType },
                    navArgument("canComment") { type = NavType.BoolType },
                ),
            ) { back ->
                val args = back.arguments!!
                ReviewScreen(
                    projectId = args.getString("projectId")!!,
                    versionId = args.getString("versionId")!!,
                    number = args.getInt("number"),
                    canComment = args.getBoolean("canComment"),
                    close = { nav.popBackStack() },
                )
            }
            composable("share/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { back ->
                ShareScreen(projectId = back.arguments?.getString("id")!!, close = { nav.popBackStack() })
            }
        }
    }
}
