import { useCallback, useEffect, useState } from 'react'
import { NAV, type View } from './nav'

const VIEWS = new Set<View>(NAV.map((n) => n.id))

interface HistoryState {
  view: View
  /** The view the user navigated from inside the app, if any. */
  from: View | null
}

function viewFromHash(): View {
  const id = window.location.hash.replace(/^#\/?/, '') as View
  return VIEWS.has(id) ? id : 'overview'
}

/**
 * Keeps the current view in the URL hash (#/review, #/transactions…) and in browser history,
 * so the browser back/forward buttons, refresh and bookmarks all work.
 */
export function useViewHistory() {
  const [state, setState] = useState<HistoryState>(() => {
    const existing = window.history.state as HistoryState | null
    const view = viewFromHash()
    return existing?.view === view ? existing : { view, from: null }
  })

  useEffect(() => {
    // Seed the first history entry so popping back to it restores the right view.
    window.history.replaceState(state, '', `#/${state.view}`)
    const onPop = (e: PopStateEvent) => {
      const s = e.state as HistoryState | null
      setState(s?.view ? s : { view: viewFromHash(), from: null })
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  const navigate = useCallback(
    (view: View) => {
      if (view === state.view) return
      // pushState stays outside the state updater: React may run updaters twice, which would add duplicate entries.
      const next = { view, from: state.view }
      window.history.pushState(next, '', `#/${view}`)
      setState(next)
      window.scrollTo({ top: 0 })
    },
    [state.view],
  )

  const back = useCallback(() => window.history.back(), [])

  return { view: state.view, from: state.from, navigate, back }
}
