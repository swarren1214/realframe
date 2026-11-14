package app.realframe.android.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Tonal palette from Realframe's raspberry (#BE185D), Material 3 style.
val Raspberry = Color(0xFFBE185D)
val Ember = Color(0xFFEA580C)
val Success = Color(0xFF059669)

private val Colors = lightColorScheme(
    primary = Raspberry,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFD9E3),
    onPrimaryContainer = Color(0xFF3E0021),
    secondary = Color(0xFF74565F),
    secondaryContainer = Color(0xFFFFD9E2),
    tertiary = Ember,
    background = Color(0xFFFFF8F7),
    onBackground = Color(0xFF22191C),
    surface = Color(0xFFFFF8F7),
    onSurface = Color(0xFF22191C),
    surfaceVariant = Color(0xFFF2DDE2),
    onSurfaceVariant = Color(0xFF524347),
    surfaceContainerLow = Color(0xFFFCF0F2),
    surfaceContainer = Color(0xFFF8E9EC),
    surfaceContainerHigh = Color(0xFFF2E1E5),
    surfaceContainerHighest = Color(0xFFECDBDF),
    outline = Color(0xFF857377),
)

// Expressive shapes: generous corners on cards and sheets.
private val ExpressiveShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

private val Type = Typography().run {
    copy(
        headlineLarge = headlineLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.Medium),
    )
}

@Composable
fun RealframeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, shapes = ExpressiveShapes, typography = Type, content = content)
}

val Mono = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, letterSpacing = 6.sp)
