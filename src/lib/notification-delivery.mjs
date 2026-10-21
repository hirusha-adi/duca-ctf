export const NOTIFICATION_TIMEOUT_MS = 2000;

/** Notification transport must never change the result of a saved mutation. */
export async function deliverBestEffortNotification(
  task,
  { timeoutMs = NOTIFICATION_TIMEOUT_MS, onError = () => {} } = {}
) {
  let timeout;
  try {
    await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Notification delivery timed out")),
          timeoutMs
        );
      }),
    ]);
    return true;
  } catch (error) {
    try {
      onError(error);
    } catch {
      // Logging is best effort too.
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function createNotificationScheduler(afterResponse, onError = () => {}) {
  return (label, task) => {
    const deliver = () => deliverBestEffortNotification(task, {
      onError: (error) => onError(label, error),
    });
    try {
      afterResponse(deliver);
    } catch {
      // A missing request context must not turn a committed write into a 500.
      void deliver();
    }
  };
}
