// Filtering for the Payouts → History ledger. Everything is already loaded in
// the browser, so filters just narrow the in-memory list before pagination.

export const EMPTY_HISTORY_FILTERS = {
  search: '',
  range: 'all',      // all | today | week | month | last_month | custom
  from: '',          // YYYY-MM-DD, used when range === 'custom'
  to: '',            // YYYY-MM-DD, inclusive
  types: [],         // entry.type values; empty = any
  statuses: [],      // entry.status values; empty = any
  by: '',            // initiatedBy; '' = anyone
};

export const DATE_RANGES = [
  { value: 'all',        label: 'All time' },
  { value: 'today',      label: 'Today' },
  { value: 'week',       label: 'This week' },
  { value: 'month',      label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom',     label: 'Custom dates…' },
];

export const isFiltering = (f) =>
  f.search.trim() !== '' || f.range !== 'all' || f.types.length > 0 || f.statuses.length > 0 || f.by !== '';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// [start, end) for the chosen range in the viewer's local time; null = no bound.
const rangeBounds = (f, now = new Date()) => {
  const today = startOfDay(now);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (f.range) {
    case 'today':
      return [today, addDays(today, 1)];
    case 'week': {
      const sinceMonday = (today.getDay() + 6) % 7; // Monday = 0
      return [addDays(today, -sinceMonday), addDays(today, 1)];
    }
    case 'month':
      return [new Date(today.getFullYear(), today.getMonth(), 1), addDays(today, 1)];
    case 'last_month':
      return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1)];
    case 'custom':
      return [f.from ? parseDay(f.from) : null, f.to ? addDays(parseDay(f.to), 1) : null];
    default:
      return [null, null];
  }
};

// Everything a person might type to find a payment: description, who sent it,
// amount, recipient phone / paybill / till / account, M-Pesa name and code,
// and payroll rows' names and phones.
const searchText = (e) => {
  const p = e.payload || {};
  const rows = Array.isArray(p.rows) ? p.rows.flatMap(r => [r.name, r.staffNo, r.resolvedPhone]) : [];
  return [
    e.label, e.initiatedBy, e.amount != null ? String(e.amount) : '',
    p.partyB, p.receiverPublicName, p.transactionReceipt,
    p.accountReference, p.destinationAccount,
    ...rows,
  ].filter(Boolean).join(' ').toLowerCase();
};

// "0712 345 678" should also find 254712345678 (how M-Pesa stores numbers).
const searchTerms = (query) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = [q];
  const digits = q.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits)) {
    if (digits !== q) terms.push(digits);
    if (digits.startsWith('0') && digits.length > 1) terms.push('254' + digits.slice(1));
  }
  return terms;
};

export const filterHistory = (history, f) => {
  const [start, end] = rangeBounds(f);
  const terms = searchTerms(f.search);
  return history.filter(e => {
    if (start || end) {
      const d = new Date(e.date);
      if (start && d < start) return false;
      if (end && d >= end) return false;
    }
    if (f.types.length && !f.types.includes(e.type)) return false;
    if (f.statuses.length && !f.statuses.includes(e.status)) return false;
    if (f.by && e.initiatedBy !== f.by) return false;
    if (terms.length) {
      const text = searchText(e);
      if (!terms.some(t => text.includes(t))) return false;
    }
    return true;
  });
};
