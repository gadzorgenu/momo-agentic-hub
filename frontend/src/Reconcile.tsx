import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
  Snackbar,
  Alert,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import DoneIcon from '@mui/icons-material/Done'
import ErrorIcon from '@mui/icons-material/Error'
import WifiIcon from '@mui/icons-material/Wifi'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import { useThemeSettings } from './theme'


type AgentEvent = {
  type: string
  payload?: any
  timestamp?: string
}

export default function Reconcile() {
  const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? ''

  const [rawText, setRawText] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [approval, setApproval] = useState<any>(null)
  const esRef = useRef<EventSource | null>(null)
  const [connected, setConnected] = useState(false)
  const [snack, setSnack] = useState<{ open: boolean; severity?: any; message?: string }>({ open: false })
  const eventsRef = useRef<HTMLDivElement | null>(null)
  let themeCtx = { dark: false, compact: false, toggleDark: () => {}, toggleCompact: () => {} }
  try {
    themeCtx = useThemeSettings()
  } catch (_) {
    // fallback when theme provider is not available or during HMR
  }
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState<string>('')

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close()
    }
  }, [])

  const append = (raw: any) => {
    // normalize incoming event shapes (backend uses `kind`, others may use `type`)
    const type = raw?.type || raw?.kind || raw?.event || 'message'
    const payload = raw?.payload ?? raw?.data ?? raw
    const timestamp = raw?.timestamp || raw?.time || new Date().toISOString()
    const normalized: AgentEvent = { type, payload, timestamp }
    setEvents((s) => [...s, normalized])
  }

  const startRun = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reconcile/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    })
      if (!res.ok) {
        append({ type: 'error', payload: await res.text() })
        return
      }
      const data = await res.json()
    const id = data.runId
    setRunId(id)
    append({ type: 'run_started', payload: { runId: id } })
    setSnack({ open: true, severity: 'info', message: 'Run started' })
    subscribeSse(id)
    fetchAttempts(id)
    } catch (err: any) {
      append({ type: 'error', payload: String(err) })
    }
  }

  const subscribeSse = (id: string) => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API_BASE}/api/reconcile/stream/${id}`)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data)
        append(parsed)
        if (parsed.type === 'approval_required') setApproval(parsed.payload)
        // auto-scroll
        setTimeout(() => eventsRef.current?.scrollTo({ top: eventsRef.current.scrollHeight, behavior: 'smooth' }), 40)
      } catch (err) {
        append({ type: 'message', payload: e.data })
      }
    }
    es.onerror = (err) => {
      append({ type: 'sse_error', payload: String(err) })
      setConnected(false)
      es.close()
    }
  }

  const sendApproval = async (action: 'approve' | 'reject') => {
    if (!runId) return
    // optimistic update
    const optimistic = { type: 'approval_sent', payload: { action, runId, optimistic: true } }
    append(optimistic)
    try {
      const res = await fetch(`${API_BASE}/api/reconcile/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        append({ type: 'approved', payload: { action, runId } })
        setApproval(null)
        // refresh audit trail filtered to this run
        fetchAttempts(runId)
        setSnack({ open: true, severity: 'success', message: `Action ${action} sent` })
      } else {
        const text = await res.text()
        append({ type: 'approve_error', payload: text })
        setSnack({ open: true, severity: 'error', message: `Approve failed: ${text}` })
      }
    } catch (err) {
      append({ type: 'approve_error', payload: String(err) })
      setSnack({ open: true, severity: 'error', message: `Approve error: ${String(err)}` })
    }
  }

  // Audit trail fetch
  const [attempts, setAttempts] = useState<any[]>([])
  const fetchAttempts = async (filterRunId?: string | null) => {
    try {
      const qs = filterRunId ? `?runId=${encodeURIComponent(filterRunId)}` : ''
      const r = await fetch(`${API_BASE}/api/reconcile/attempts${qs}`)
      if (!r.ok) return
      const data = await r.json()
      setAttempts(data)
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => { fetchAttempts() }, [])

  return (
    <Box sx={{ p: 2, maxWidth: 1000 }}>
      <Paper sx={{ p: 2 }} elevation={2}>
        <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <WifiIcon sx={{ color: connected ? 'success.main' : 'grey.500' }} />
            <Typography variant="h5">Reconcile (Human-in-the-loop)</Typography>
            <IconButton size="small" onClick={() => { themeCtx.toggleDark(); setSnack({ open: true, message: `Theme ${themeCtx.dark ? 'light' : 'dark'}` }) }} title="Toggle theme">
              {themeCtx.dark ? <Brightness7Icon /> : <DarkModeIcon />}
            </IconButton>
            <Button size="small" onClick={() => { themeCtx.toggleCompact(); setSnack({ open: true, message: themeCtx.compact ? 'Comfort' : 'Compact' }) }} sx={{ ml: 1 }}>{themeCtx.compact ? 'Compact' : 'Comfort'}</Button>
          </Stack>
          {runId ? <Typography variant="body2">Run: {runId}</Typography> : null}
        </Stack>
        <Typography variant="body2" sx={{ mb: 2 }}>Paste a raw Mobile Money receipt below and start a reconciliation run.</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              multiline
              minRows={8}
              fullWidth
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste receipt text here"
              variant="outlined"
            />
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Button variant="contained" onClick={startRun}>Start Run</Button>
              {runId && <Typography sx={{ alignSelf: 'center' }}>Run: {runId}</Typography>}
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1">Events</Typography>
            <Paper sx={{ background: '#111', color: '#eee', p: 1, minHeight: 220 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" sx={{ color: '#ddd' }}>Events</Typography>
                <Stack direction="row" spacing={1}>
                  <IconButton size="small" onClick={() => { setEvents([]); setSnack({ open: true, message: 'Cleared events' }) }} title="Clear events">
                    <ClearAllIcon sx={{ color: '#ddd' }} />
                  </IconButton>
                  {runId && (
                    <IconButton size="small" onClick={async () => { await navigator.clipboard.writeText(runId); setSnack({ open: true, severity: 'info', message: 'RunId copied' }) }} title="Copy runId">
                      <ContentCopyIcon sx={{ color: '#ddd' }} />
                    </IconButton>
                  )}
                </Stack>
              </Stack>
              <Box sx={{ mt: 1, mb: 1, display: 'flex', gap: 8 }}>
                <TextField size="small" placeholder="Filter events" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                <TextField size="small" placeholder="Type (e.g. approval_required)" value={filterType} onChange={(e) => setFilterType(e.target.value)} />
              </Box>
              <Box ref={eventsRef} sx={{ maxHeight: 260, overflow: 'auto', mt: 1 }}>
                <List dense>
                  {events
                    .filter((ev) => (!filterType || ev.type.includes(filterType)) && (!filterText || JSON.stringify(ev).toLowerCase().includes(filterText.toLowerCase())))
                    .map((ev, i) => (
                      <ListItem key={i} sx={{ alignItems: 'flex-start', py: themeCtx.compact ? 0.5 : 1 }}>
                        <ListItemAvatar>
                          {ev.type === 'error' ? <ErrorIcon color="error" /> : <DoneIcon color="success" />}
                        </ListItemAvatar>
                        <ListItemText
                          primary={<Stack direction="row" spacing={1} alignItems="center"><Typography variant="caption" sx={{ color: '#bbb' }}>{ev.type}</Typography><Typography variant="caption" sx={{ color: '#777' }}>{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}</Typography></Stack>}
                          secondary={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(ev.payload, null, 2)}</pre>}
                        />
                      </ListItem>
                    ))}
                </List>
              </Box>
            </Paper>
            <Paper sx={{ mt: 2, p: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">Audit Trail {runId ? `(run filtered)` : '(recent 50)'}</Typography>
                <IconButton size="small" onClick={() => fetchAttempts(runId)} title="Refresh audit trail">
                  <DoneIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                {attempts.map((a: any) => (
                  <Box key={a.id} sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                    <Typography variant="caption">{new Date(a.createdAt).toLocaleString()} — {a.status}</Typography>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.note}</pre>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      <Dialog open={!!approval} onClose={() => setApproval(null)} maxWidth="md" fullWidth>
        <DialogTitle>Approval Required</DialogTitle>
        <DialogContent>
          <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(approval, null, 2)}</pre>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => sendApproval('reject')}>Reject</Button>
          <Button variant="contained" onClick={() => sendApproval('approve')}>Approve</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!snack.open} autoHideDuration={4000} onClose={() => setSnack({ open: false })}>
        <Alert severity={snack.severity || 'info'} sx={{ width: '100%' }}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  )
}
