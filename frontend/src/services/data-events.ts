/**
 * Lightweight browser event bus to synchronize appointment, doctor schedule,
 * and review changes across frontend dashboard components.
 */

type DataChangeListener = () => void;
const listeners = new Set<DataChangeListener>();

/**
 * Subscribes a callback to data change events (e.g. appointment created, cancelled,
 * rescheduled, status updated, or review submitted).
 */
export function subscribeDataChange(listener: DataChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Broadcasts a data change notification to all active components.
 */
export function notifyDataChange(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('Error executing data change listener:', err);
    }
  });
}
