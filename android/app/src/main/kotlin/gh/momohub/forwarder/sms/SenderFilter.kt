package gh.momohub.forwarder.sms

/**
 * Sender IDs on Ghanaian MoMo SMS vary wildly by operator and vintage.
 * The allowlist is user-editable in settings; we match generously:
 *  - case-insensitive
 *  - any whitespace / punctuation ignored
 *  - substring match in either direction
 */
object SenderFilter {

    fun matches(sender: String, allowlist: List<String>): Boolean {
        if (allowlist.isEmpty()) return false
        val normalized = normalize(sender)
        if (normalized.isEmpty()) return false
        return allowlist.any { allow ->
            val a = normalize(allow)
            a.isNotEmpty() && (normalized.contains(a) || a.contains(normalized))
        }
    }

    private fun normalize(value: String): String =
        value.lowercase().filter { it.isLetterOrDigit() }
}
