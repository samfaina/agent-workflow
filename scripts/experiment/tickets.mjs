// Parses a change's tasks.md in the ticket format of the adapter
// (templates/docs/agents/issue-tracker.md, "Ticket format").

export function parseTickets(text) {
  const tickets = [];
  let current = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^## (\d+)\. (.+)$/);
    if (heading) {
      current = { number: Number(heading[1]), title: heading[2].trim(), blockedBy: null, whatToBuild: false, boxes: [] };
      tickets.push(current);
      continue;
    }
    if (!current) continue;
    const blocked = line.match(/^Blocked by:\s*(.+)$/i);
    if (blocked) {
      current.blockedBy = /^none\b/i.test(blocked[1].trim()) ? [] : (blocked[1].match(/\d+/g) ?? []).map(Number);
    }
    if (/^What to build:/i.test(line)) current.whatToBuild = true;
    const box = line.match(/^- \[([ xX])\] (\d+)\.(\d+) (.+)$/);
    if (box) current.boxes.push({ done: box[1].toLowerCase() === 'x', group: Number(box[2]), item: Number(box[3]), text: box[4] });
  }
  return tickets;
}

export const isDone = (ticket) => ticket.boxes.length > 0 && ticket.boxes.every((b) => b.done);

// The adapter's frontier: the first ticket whose blockers are done and that still has an unticked box.
export function frontier(tickets) {
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  return tickets.find((t, i) => {
    const blockers = t.blockedBy ?? (i > 0 ? [tickets[i - 1].number] : []);
    return !isDone(t) && blockers.every((n) => byNumber.has(n) && isDone(byNumber.get(n)));
  }) ?? null;
}
