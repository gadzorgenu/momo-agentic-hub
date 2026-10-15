package gh.momohub.forwarder

import android.app.Application
import androidx.work.Configuration

class ForwarderApp : Application(), Configuration.Provider {
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()
}
