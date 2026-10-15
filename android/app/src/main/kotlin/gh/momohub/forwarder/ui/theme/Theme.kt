package gh.momohub.forwarder.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Amber = Color(0xFFF59E0B)
private val Slate900 = Color(0xFF0F172A)

private val LightScheme = lightColorScheme(
    primary = Slate900,
    secondary = Amber,
)

private val DarkScheme = darkColorScheme(
    primary = Amber,
    secondary = Slate900,
)

@Composable
fun ForwarderTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) DarkScheme else LightScheme
    MaterialTheme(colorScheme = scheme, content = content)
}
