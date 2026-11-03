// A pending user-confirmed edit may not outlive its Project/source context.
// This is only a browser-side interlock; Core remains the execution authority.
export function createAsyncEditIntentFence() {
  let generation = 0;
  let activeTicket = null;
  return Object.freeze({
    begin() {
      if (activeTicket !== null) return null;
      activeTicket = ++generation;
      return activeTicket;
    },
    isCurrent(ticket) {
      return Number.isSafeInteger(ticket) && activeTicket === ticket;
    },
    finish(ticket) {
      if (activeTicket !== ticket || ticket === null) return false;
      activeTicket = null;
      return true;
    },
    invalidate() {
      generation += 1;
      activeTicket = null;
    },
  });
}
