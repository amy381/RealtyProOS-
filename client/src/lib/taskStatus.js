// Shared: move a task to In Progress after an email/vendor doc actually sends.
// Every real SEND path calls this so status behavior can't drift per-button.
// Not used by preview paths — preview doesn't send, so status must not change.
import { toast } from 'react-hot-toast'

export async function markTaskInProgress(supabase, taskId, onUpdate) {
  const { error } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', taskId)
  if (error) {
    console.error('[markTaskInProgress]', error)
    toast.error('Sent, but failed to update task status')
    return
  }
  onUpdate?.(taskId, { status: 'in_progress' })
}
