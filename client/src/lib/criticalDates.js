// Shared: which Critical Date tasks are still "live".
//
// Mirrors the desktop Tasks page rule (TasksTab.jsx groupedData). A Critical Date
// task is hidden when it is complete, when a completed task points at it via
// resolves_critical_date, or when its due_date is before today.
//
// todayStr deliberately uses toISOString() (UTC) — same as desktop — so both
// views show the same list. Pass todayStr only to override (tests).
//
// Takes the whole tasks array (any mix of transactions). Desktop resolves per
// transaction group; resolves_critical_date holds a task id, so a single global
// set gives the same result.
export function getVisibleCriticalDates(tasks, todayStr = new Date().toISOString().slice(0, 10)) {
  const resolvedCritIds = new Set(
    tasks
      .filter(t => t.status === 'complete' && t.resolves_critical_date)
      .map(t => t.resolves_critical_date)
  )

  return tasks.filter(t => {
    if (t.task_type !== 'Critical Date') return false
    if (t.status === 'complete') return false
    if (resolvedCritIds.has(t.id)) return false
    if (t.due_date && t.due_date < todayStr) return false
    return true
  })
}
