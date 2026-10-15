package gh.momohub.forwarder.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import gh.momohub.forwarder.data.AppDatabase
import gh.momohub.forwarder.data.SettingsStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onOpenSettings: () -> Unit,
    onRunBackfill: () -> Unit,
    onSyncNow: () -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val settingsStore = remember { SettingsStore(context) }
    val dao = remember { AppDatabase.get(context).pendingSms() }

    val settings by settingsStore.settings.collectAsState(initial = null)
    val pending by dao.pendingCount().collectAsState(initial = 0)
    val lastSynced by dao.lastSyncedAt().collectAsState(initial = null)

    val configured = settings?.isConfigured == true
    val enabled = settings?.forwardingEnabled == true

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("MoMo Forwarder", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StatusCard(
                configured = configured,
                enabled = enabled,
                pending = pending,
                lastSyncedAt = lastSynced,
            )

            if (!configured) {
                HintCard(
                    title = "Add your backend URL",
                    body = "Open settings and enter the URL of your MoMo Hub backend (e.g. https://hub.example.com). SMS will be queued until this is set.",
                    cta = "Open settings",
                    onCta = onOpenSettings,
                )
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    FilledTonalButton(onClick = onSyncNow, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Sync, contentDescription = null)
                        Spacer(Modifier.size(6.dp))
                        Text("Sync now")
                    }
                    ElevatedButton(onClick = onRunBackfill, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Download, contentDescription = null)
                        Spacer(Modifier.size(6.dp))
                        Text("Backfill 7d")
                    }
                }
            }

            Text(
                "SMS from the senders in your allowlist are forwarded automatically. Everything else stays on your phone.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StatusCard(
    configured: Boolean,
    enabled: Boolean,
    pending: Int,
    lastSyncedAt: Long?,
) {
    val okColor = Color(0xFF059669)
    val warnColor = Color(0xFFD97706)
    val offColor = Color(0xFF64748B)

    val (dot, label) = when {
        !configured -> offColor to "Not configured"
        !enabled -> offColor to "Paused"
        pending > 0 -> warnColor to "$pending queued"
        else -> okColor to "Live"
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(10.dp)
                        .clip(CircleShape),
                ) {
                    Surface(color = dot, shape = CircleShape) { Spacer(Modifier.size(10.dp)) }
                }
                Spacer(Modifier.size(10.dp))
                Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = if (configured && enabled) Icons.Default.CheckCircle else Icons.Default.CloudOff,
                    contentDescription = null,
                    tint = if (configured && enabled) okColor else offColor,
                )
                Text(
                    text = lastSyncedAt?.let { "Last sent ${formatRelative(it)}" } ?: "No messages sent yet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun HintCard(title: String, body: String, cta: String, onCta: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(body, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            FilledTonalButton(onClick = onCta) { Text(cta) }
        }
    }
}

private fun formatRelative(epochMillis: Long): String {
    val now = System.currentTimeMillis()
    val delta = now - epochMillis
    return when {
        delta < 60_000 -> "just now"
        delta < 3_600_000 -> "${delta / 60_000}m ago"
        delta < 86_400_000 -> "${delta / 3_600_000}h ago"
        else -> SimpleDateFormat("d MMM HH:mm", Locale.getDefault()).format(Date(epochMillis))
    }
}

