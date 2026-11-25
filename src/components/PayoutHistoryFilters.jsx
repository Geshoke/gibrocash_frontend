import { DATE_RANGES, EMPTY_HISTORY_FILTERS, isFiltering } from '../utils/payoutHistoryFilter';

/**
 * Filter bar for the Payouts history ledger. Type, status and "transacted by"
 * options are built from what is actually in the ledger.
 */
const PayoutHistoryFilters = ({ history, filters, onChange, typeLabels, statusMeta }) => {
  const set = (patch) => onChange({ ...filters, ...patch });
  const toggle = (key, value) => set({
    [key]: filters[key].includes(value) ? filters[key].filter(v => v !== value) : [...filters[key], value],
  });

  const types    = [...new Set(history.map(h => h.type).filter(Boolean))];
  const statuses = Object.keys(statusMeta).filter(s => history.some(h => h.status === s));
  const people   = [...new Set(history.map(h => h.initiatedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="po-filters">
      <div className="po-filters-row">
        <input
          type="search"
          className="po-filter-search"
          placeholder="Search description, name, phone, paybill or M-Pesa code…"
          value={filters.search}
          onChange={e => set({ search: e.target.value })}
        />
        <select
          className="po-filter-select"
          value={filters.range}
          onChange={e => set({ range: e.target.value })}
          aria-label="Date range"
        >
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {filters.range === 'custom' && (
          <span className="po-filter-dates">
            <input type="date" value={filters.from} max={filters.to || undefined}
              onChange={e => set({ from: e.target.value })} aria-label="From date" />
            <span>to</span>
            <input type="date" value={filters.to} min={filters.from || undefined}
              onChange={e => set({ to: e.target.value })} aria-label="To date" />
          </span>
        )}
        {people.length > 1 && (
          <select
            className="po-filter-select"
            value={filters.by}
            onChange={e => set({ by: e.target.value })}
            aria-label="Transacted by"
          >
            <option value="">Anyone</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {isFiltering(filters) && (
          <button type="button" className="po-filter-clear" onClick={() => onChange(EMPTY_HISTORY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {(types.length > 1 || statuses.length > 1) && (
        <div className="po-filters-row">
          {types.length > 1 && (
            <div className="po-chip-group" role="group" aria-label="Type">
              <span className="po-chip-label">Type</span>
              {types.map(t => (
                <button type="button" key={t}
                  className={`po-chip${filters.types.includes(t) ? ' active' : ''}`}
                  aria-pressed={filters.types.includes(t)}
                  onClick={() => toggle('types', t)}>
                  {typeLabels[t] || t}
                </button>
              ))}
            </div>
          )}
          {statuses.length > 1 && (
            <div className="po-chip-group" role="group" aria-label="Status">
              <span className="po-chip-label">Status</span>
              {statuses.map(s => (
                <button type="button" key={s}
                  className={`po-chip${filters.statuses.includes(s) ? ' active' : ''}`}
                  aria-pressed={filters.statuses.includes(s)}
                  onClick={() => toggle('statuses', s)}>
                  <span className="po-status-dot" style={{ background: statusMeta[s].dot }} />
                  {statusMeta[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PayoutHistoryFilters;
