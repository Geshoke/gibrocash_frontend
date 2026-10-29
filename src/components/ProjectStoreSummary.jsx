import { useEffect, useState } from 'react';
import { storeService } from '../services/api';

const fmtCur = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);
const fmtQty = (n) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n || 0);
const fmtDay = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

// Collapsed/expanded is a per-browser preference, kept across projects and visits.
const COLLAPSE_KEY = 'gibrocash_project_store_collapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) !== '0'; } catch { return true; }
};

/**
 * How a project's spending relates to the company store: items it bought that went
 * into the store (cost leaves the project), consumables it took from the store (cost
 * comes to it), and tools on it now. Renders nothing for projects that never touched
 * the store. Only rendered for users who can view the store.
 * Reports the ids of transactions with stock in the store through onTransactionIds.
 */
const ProjectStoreSummary = ({ projectId, totalUsed, onTransactionIds }) => {
  const [summary, setSummary] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    let cancelled = false;
    storeService.projectSummary(projectId)
      .then(({ data }) => {
        if (cancelled) return;
        setSummary(data);
        onTransactionIds(new Set(data.transaction_ids || []));
      })
      .catch(err => console.error('Failed to load project store summary:', err));
    return () => { cancelled = true; };
  }, [projectId, onTransactionIds]);

  if (!summary?.has_activity) return null;

  const netCost = (parseFloat(totalUsed) || 0) - summary.moved_value + summary.issued_value;

  const toggleCollapsed = () => {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* preference only */ }
      return !c;
    });
  };

  return (
    <div className="imprests-section ps-section">
      <div className="detail-summary ps-summary">
        <div className="summary-card ps-moved">
          <span className="label">Moved to store</span>
          <span className="amount">− {fmtCur(summary.moved_value)}</span>
          <span className="ps-sub">{summary.moved_in.length} item{summary.moved_in.length !== 1 ? 's' : ''} bought here, kept by the company</span>
        </div>
        <div className="summary-card ps-issued">
          <span className="label">Issued from store</span>
          <span className="amount">+ {fmtCur(summary.issued_value)}</span>
          <span className="ps-sub">{summary.issued.length} item{summary.issued.length !== 1 ? 's' : ''} used from company stock</span>
        </div>
        <div className="summary-card ps-net">
          <span className="label">Net project cost</span>
          <span className="amount">{fmtCur(netCost)}</span>
          <span className="ps-sub">Used − moved to store + issued from store</span>
        </div>
      </div>

      <div className="imprests-section-head">
        <h3>
          <button
            type="button"
            className="cp-toggle"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show store details' : 'Hide store details'}
          >
            <span className={`cp-chevron${collapsed ? '' : ' open'}`}>▸</span>
            Store details
            {summary.tools_here.length > 0 && (
              <span className="cp-collapsed-total">
                · {summary.tools_here.reduce((s, t) => s + t.quantity, 0)} tool(s) on this project
              </span>
            )}
          </button>
        </h3>
      </div>

      {!collapsed && (
        <div className="ps-details">
          {summary.moved_in.length > 0 && (
            <>
              <h4>Moved to store</h4>
              <table className="transactions-table compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Store item</th>
                    <th className="cp-num">Qty</th>
                    <th>From transaction</th>
                    <th className="cp-num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.moved_in.map(m => (
                    <tr key={m.id}>
                      <td>{fmtDay(m.movement_date)}</td>
                      <td>{m.store_item?.name}</td>
                      <td className="cp-num">{fmtQty(m.quantity)} {m.store_item?.unit}</td>
                      <td>
                        {m.transaction?.item || '—'}
                        {m.transaction?.imprest?.name && <span className="cp-sub"> · {m.transaction.imprest.name}</span>}
                      </td>
                      <td className="cp-num">{fmtCur(m.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {summary.issued.length > 0 && (
            <>
              <h4>Issued from store</h4>
              <table className="transactions-table compact">
                <thead>
                  <tr>
                    <th>Store item</th>
                    <th className="cp-num">Qty (net of returns)</th>
                    <th className="cp-num">Charged</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.issued.map(i => (
                    <tr key={i.store_item?.id}>
                      <td>{i.store_item?.name}</td>
                      <td className="cp-num">{fmtQty(i.quantity)} {i.store_item?.unit}</td>
                      <td className="cp-num">{fmtCur(i.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {summary.tools_here.length > 0 && (
            <>
              <h4>Tools on this project now</h4>
              <table className="transactions-table compact">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th className="cp-num">Qty</th>
                    <th>With</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.tools_here.map(t => (
                    <tr key={`${t.store_item?.id}|${t.holder_name || ''}`}>
                      <td>{t.store_item?.name}</td>
                      <td className="cp-num">{fmtQty(t.quantity)} {t.store_item?.unit}</td>
                      <td>{t.holder_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {summary.moved_in.length === 0 && summary.issued.length === 0 && summary.tools_here.length === 0 && (
            <p className="no-data-inline">Everything issued or checked out to this project has come back.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectStoreSummary;
