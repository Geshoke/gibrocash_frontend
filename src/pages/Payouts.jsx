import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import './Payouts.css';

// ── Constants ──────────────────────────────────────────────────
const PIN_TIMEOUT_SECS = 600;

// ── Helpers ────────────────────────────────────────────────────
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line) => {
    const result = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim()); return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map((line, idx) => {
    const vals = parseRow(line);
    const row = { _id: idx };
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
};

const detectAmountCol = (headers) =>
  headers.find(h => /amount|salary|pay|gross|net/i.test(h));

const sumAmount = (rows, headers) => {
  const col = detectAmountCol(headers);
  if (!col) return null;
  return rows.reduce((s, r) => {
    const v = parseFloat((r[col] || '').replace(/,/g, ''));
    return s + (isNaN(v) ? 0 : v);
  }, 0);
};

const fmtCur = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const fmtTimer = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const isToday = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
};

const STATUS_META = {
  pending_pin: { label: 'Awaiting PIN', cls: 'pending',    dot: '#f59e0b' },
  processing:  { label: 'Processing',   cls: 'processing', dot: '#3b82f6' },
  completed:   { label: 'Completed',    cls: 'completed',  dot: '#22c55e' },
  failed:      { label: 'Failed',       cls: 'failed',     dot: '#ef4444' },
  expired:     { label: 'PIN Expired',  cls: 'expired',    dot: '#6b7280' },
  cancelled:   { label: 'Cancelled',    cls: 'cancelled',  dot: '#6b7280' },
};

const TYPE_LABEL = { payroll: 'Payroll', single: 'Single Payment', b2b: 'B2B Payment' };

const NAV_ITEMS = [
  { key: 'payroll', icon: '💰', label: 'Payroll'        },
  { key: 'single',  icon: '📤', label: 'Single Payment' },
  { key: 'b2b',     icon: '🏦', label: 'B2B Payment'    },
  { key: 'history', icon: '📋', label: 'History'        },
];

// ── Component ──────────────────────────────────────────────────
const Payouts = () => {
  const [view, setView] = useState('history');

  // Payroll
  const [csvData, setCsvData]         = useState({ headers: [], rows: [] });
  const [payrollName, setPayrollName] = useState('');
  const [csvError, setCsvError]       = useState('');

  // Single
  const [single, setSingle] = useState({ contact: '', amount: '', description: '' });

  // B2B
  const [b2bType, setB2bType] = useState('paybill');
  const [b2b, setB2b] = useState({ paybillNumber: '', accountNumber: '', tillNumber: '', amount: '' });

  // PIN modal
  const [modal, setModal]           = useState(null);
  const [pin, setPin]               = useState('');
  const [timeLeft, setTimeLeft]     = useState(PIN_TIMEOUT_SECS);
  const [pinExpired, setPinExpired] = useState(false);
  const modalRef = useRef(null);
  const timerRef = useRef(null);

  // History
  const [history, setHistory]   = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { modalRef.current = modal; }, [modal]);

  useEffect(() => {
    if (!modal || pinExpired) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setPinExpired(true);
          if (modalRef.current) pushHistory(modalRef.current, 'expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [modal]); // eslint-disable-line

  // ── Derived stats ───────────────────────────────────────────
  const totalDisbursed  = history.filter(h => h.status === 'completed').reduce((s, h) => s + (h.amount || 0), 0);
  const pendingCount    = history.filter(h => h.status === 'pending_pin' || h.status === 'processing').length;
  const settledToday    = history.filter(h => h.status === 'completed' && isToday(h.date)).reduce((s, h) => s + (h.amount || 0), 0);
  const failedCount     = history.filter(h => h.status === 'failed' || h.status === 'expired').length;

  // ── History helpers ─────────────────────────────────────────
  const pushHistory = (m, status) => {
    setHistory(prev => [{
      id: m.id, type: m.type, label: m.label,
      amount: m.amount, date: new Date().toISOString(),
      status, payload: m.payload,
    }, ...prev]);
  };

  // ── Modal helpers ───────────────────────────────────────────
  const openModal = (type, label, amount, payload) => {
    clearInterval(timerRef.current);
    setModal({ id: Date.now().toString(), type, label, amount, payload });
    setPin(''); setTimeLeft(PIN_TIMEOUT_SECS); setPinExpired(false);
  };

  const cancelModal = () => {
    clearInterval(timerRef.current);
    if (modalRef.current && !pinExpired) pushHistory(modalRef.current, 'cancelled');
    setModal(null); setPin('');
  };

  const submitPin = () => {
    if (pin.length !== 5 || pinExpired) return;
    clearInterval(timerRef.current);
    const m = { ...modal };
    pushHistory(m, 'processing');
    setModal(null); setPin('');
    // TODO: POST /payouts/authorise  { payoutId: m.id, pin }
    setTimeout(() => {
      setHistory(prev => prev.map(h => h.id === m.id ? { ...h, status: 'completed' } : h));
    }, 2500);
    if (m.type === 'payroll') { setCsvData({ headers: [], rows: [] }); setPayrollName(''); }
    if (m.type === 'single')  setSingle({ contact: '', amount: '', description: '' });
    if (m.type === 'b2b')     setB2b({ paybillNumber: '', accountNumber: '', tillNumber: '', amount: '' });
    setView('history');
  };

  // ── CSV ─────────────────────────────────────────────────────
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setCsvError('Please upload a .csv file.'); return; }
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      parsed.headers.length === 0
        ? setCsvError('CSV is empty or unreadable.')
        : setCsvData(parsed);
    };
    reader.readAsText(file);
  };

  // ── Submit handlers ─────────────────────────────────────────
  const submitPayroll = () => {
    if (!payrollName.trim() || csvData.rows.length === 0) return;
    // TODO: POST /payouts/payroll/initiate
    openModal('payroll', payrollName.trim(), sumAmount(csvData.rows, csvData.headers), {
      headers: csvData.headers, rows: csvData.rows,
    });
  };

  const submitSingle = () => {
    if (!single.contact.trim() || !single.amount) return;
    // TODO: POST /payouts/single/initiate
    openModal('single', `Payment to ${single.contact}`, parseFloat(single.amount) || 0, { ...single });
  };

  const submitB2B = () => {
    const label = b2bType === 'paybill'
      ? `Paybill ${b2b.paybillNumber} — Acc: ${b2b.accountNumber}`
      : `Till ${b2b.tillNumber}`;
    // TODO: POST /payouts/b2b/initiate
    openModal('b2b', label, parseFloat(b2b.amount) || 0, { b2bType, ...b2b });
  };

  const b2bReady = b2bType === 'paybill'
    ? b2b.paybillNumber && b2b.accountNumber && b2b.amount
    : b2b.tillNumber && b2b.amount;

  // ── Render ──────────────────────────────────────────────────
  return (
    <Layout>
      <div className="po-page">

        {/* ── Row 1: Hero cards ─────────────────────────────── */}
        <div className="po-hero-row">
          <div className="po-hero-card primary">
            <div className="po-hero-pill">● AVAILABLE TO DISBURSE</div>
            <div className="po-hero-amount">KES —</div>
            {/* TODO: fetch balance from M-Pesa B2C account API */}
            <div className="po-hero-sub">Source: <span className="po-hero-src">M-Pesa Business Account</span></div>
            <div className="po-hero-indicators">
              <span className="po-ind"><span className="po-ind-dot green"></span>System operational</span>
              <span className="po-ind"><span className="po-ind-dot blue"></span>Daraja API connected</span>
            </div>
          </div>

          <div className="po-hero-card secondary">
            <div className="po-hero-pill muted">AMOUNT IN ACCOUNT</div>
            <div className="po-hero-amount dim">KES —</div>
            {/* TODO: fetch from account balance API */}
            <div className="po-hero-sub">Working balance available for disbursement</div>
          </div>
        </div>

        {/* ── Row 2: Stat cards ─────────────────────────────── */}
        <div className="po-stats-row">
          <div className="po-stat-card">
            <div className="po-stat-header">
              <span className="po-stat-label">Total Disbursed</span>
              <span className="po-stat-icon">💸</span>
            </div>
            <div className="po-stat-value">{fmtCur(totalDisbursed)}</div>
            <div className="po-stat-sub">All time · completed payouts</div>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-header">
              <span className="po-stat-label">Pending</span>
              <span className="po-stat-icon">⏳</span>
            </div>
            <div className="po-stat-value numeric">{pendingCount}</div>
            <div className="po-stat-sub">Awaiting PIN or processing</div>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-header">
              <span className="po-stat-label">Settled Today</span>
              <span className="po-stat-icon">✅</span>
            </div>
            <div className="po-stat-value green">{fmtCur(settledToday)}</div>
            <div className="po-stat-sub">Completed today</div>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-header">
              <span className="po-stat-label">Total Failed</span>
              <span className="po-stat-icon">⚠️</span>
            </div>
            <div className="po-stat-value red numeric">{failedCount}</div>
            <div className="po-stat-sub">Failed or PIN expired</div>
          </div>
        </div>

        {/* ── Row 3: Main body ──────────────────────────────── */}
        <div className="po-main">

          {/* Left: active view */}
          <div className="po-content-panel">

            {/* History view */}
            {view === 'history' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Transaction Ledger</h2>
                    <p>Real-time payout activity</p>
                  </div>
                </div>

                {history.length === 0 ? (
                  <div className="po-empty">
                    <span className="po-empty-icon">📭</span>
                    <p>No payout history yet. Initiate a payment using the menu on the right.</p>
                  </div>
                ) : (
                  <div className="po-table-wrap">
                    <table className="po-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(entry => (
                          <React.Fragment key={entry.id}>
                            <tr>
                              <td className="td-mono">{fmtDate(entry.date)}</td>
                              <td><span className={`po-type-badge ${entry.type}`}>{TYPE_LABEL[entry.type]}</span></td>
                              <td className="td-desc">{entry.label}</td>
                              <td className="td-amount">{entry.amount !== null ? fmtCur(entry.amount) : '—'}</td>
                              <td>
                                <span className="po-status-dot" style={{ background: STATUS_META[entry.status]?.dot }}></span>
                                <span className={`po-status-txt ${STATUS_META[entry.status]?.cls}`}>
                                  {STATUS_META[entry.status]?.label}
                                </span>
                              </td>
                              <td>
                                {entry.type === 'payroll' && (
                                  <button
                                    className="po-expand-btn"
                                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                                  >
                                    {expanded === entry.id ? '▲' : '▼'}
                                  </button>
                                )}
                              </td>
                            </tr>

                            {entry.type === 'payroll' && expanded === entry.id && (
                              <tr className="po-sub-row">
                                <td colSpan={6}>
                                  <div className="po-sub-wrap">
                                    <table className="po-table po-sub-table">
                                      <thead>
                                        <tr>
                                          {entry.payload.headers.map(h => <th key={h}>{h}</th>)}
                                          <th>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entry.payload.rows.map(row => (
                                          <tr key={row._id}>
                                            {entry.payload.headers.map(h => <td key={h}>{row[h]}</td>)}
                                            <td>
                                              <span className="po-status-dot" style={{ background: STATUS_META[entry.status]?.dot }}></span>
                                              <span className={`po-status-txt ${STATUS_META[entry.status]?.cls}`}>
                                                {STATUS_META[entry.status]?.label}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Payroll form */}
            {view === 'payroll' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Payroll Import</h2>
                    <p>Upload a CSV, review, then initiate. Director PIN required to disburse.</p>
                  </div>
                </div>
                <div className="po-form">
                  <div className="po-field">
                    <label>Payroll Period / Name</label>
                    <input
                      type="text"
                      value={payrollName}
                      onChange={e => setPayrollName(e.target.value)}
                      placeholder="e.g. March 2026 Payroll"
                    />
                  </div>
                  <div className="po-field">
                    <label>Upload CSV File</label>
                    <label htmlFor="csv-upload" className={`po-drop-zone ${csvData.rows.length > 0 ? 'loaded' : ''}`}>
                      <span className="po-drop-icon">{csvData.rows.length > 0 ? '✅' : '📂'}</span>
                      <span className="po-drop-main">
                        {csvData.rows.length > 0 ? `${csvData.rows.length} records loaded` : 'Click to upload CSV'}
                      </span>
                      <span className="po-drop-hint">
                        {csvData.rows.length > 0 ? 'Click to replace file' : 'Comma-separated values (.csv)'}
                      </span>
                      <input id="csv-upload" type="file" accept=".csv" onChange={handleCSV} />
                    </label>
                    {csvError && <p className="po-field-error">{csvError}</p>}
                  </div>

                  {csvData.rows.length > 0 && (
                    <>
                      <div className="po-csv-meta">
                        <span>{csvData.rows.length} records</span>
                        {sumAmount(csvData.rows, csvData.headers) !== null && (
                          <span>Total: <strong>{fmtCur(sumAmount(csvData.rows, csvData.headers))}</strong></span>
                        )}
                      </div>
                      <div className="po-table-wrap">
                        <table className="po-table">
                          <thead><tr>{csvData.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                          <tbody>
                            {csvData.rows.map(row => (
                              <tr key={row._id}>{csvData.headers.map(h => <td key={h}>{row[h]}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <div className="po-form-footer">
                    <button className="po-initiate-btn" onClick={submitPayroll}
                      disabled={!payrollName.trim() || csvData.rows.length === 0}>
                      Initiate Payroll Payment
                    </button>
                    {!payrollName.trim() && csvData.rows.length > 0 && (
                      <span className="po-hint">Enter a payroll name to continue</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Single Payment form */}
            {view === 'single' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Single Payment</h2>
                    <p>Send a one-off payment to an individual contact. Director PIN required.</p>
                  </div>
                </div>
                <div className="po-form narrow">
                  <div className="po-field">
                    <label>Contact / Phone Number</label>
                    <input type="text" value={single.contact}
                      onChange={e => setSingle(p => ({ ...p, contact: e.target.value }))}
                      placeholder="e.g. 0712345678" />
                  </div>
                  <div className="po-field">
                    <label>Amount (KES)</label>
                    <input type="number" value={single.amount}
                      onChange={e => setSingle(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00" min="0" step="0.01" />
                  </div>
                  <div className="po-field">
                    <label>Description / Reason</label>
                    <textarea value={single.description}
                      onChange={e => setSingle(p => ({ ...p, description: e.target.value }))}
                      placeholder="e.g. Payment for plumbing services" rows={3} />
                  </div>
                  {single.contact && single.amount && (
                    <div className="po-preview">
                      Sending <strong>{fmtCur(single.amount)}</strong> to <strong>{single.contact}</strong>
                    </div>
                  )}
                  <div className="po-form-footer">
                    <button className="po-initiate-btn" onClick={submitSingle}
                      disabled={!single.contact.trim() || !single.amount}>
                      Initiate Payment
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* B2B Payment form */}
            {view === 'b2b' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>B2B Payment</h2>
                    <p>Pay directly to a paybill or till number. Director PIN required.</p>
                  </div>
                </div>
                <div className="po-form narrow">
                  <div className="po-toggle-group">
                    <button className={`po-toggle-opt ${b2bType === 'paybill' ? 'active' : ''}`}
                      onClick={() => setB2bType('paybill')}>Paybill</button>
                    <button className={`po-toggle-opt ${b2bType === 'till' ? 'active' : ''}`}
                      onClick={() => setB2bType('till')}>Till Number</button>
                  </div>

                  {b2bType === 'paybill' ? (
                    <>
                      <div className="po-field">
                        <label>Paybill Number</label>
                        <input type="text" value={b2b.paybillNumber}
                          onChange={e => setB2b(p => ({ ...p, paybillNumber: e.target.value }))}
                          placeholder="e.g. 400200" />
                      </div>
                      <div className="po-field">
                        <label>Account Number</label>
                        <input type="text" value={b2b.accountNumber}
                          onChange={e => setB2b(p => ({ ...p, accountNumber: e.target.value }))}
                          placeholder="e.g. ACC123456" />
                      </div>
                    </>
                  ) : (
                    <div className="po-field">
                      <label>Till Number</label>
                      <input type="text" value={b2b.tillNumber}
                        onChange={e => setB2b(p => ({ ...p, tillNumber: e.target.value }))}
                        placeholder="e.g. 123456" />
                    </div>
                  )}

                  <div className="po-field">
                    <label>Amount (KES)</label>
                    <input type="number" value={b2b.amount}
                      onChange={e => setB2b(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00" min="0" step="0.01" />
                  </div>

                  {b2b.amount && (
                    <div className="po-preview">
                      {b2bType === 'paybill'
                        ? <>Sending <strong>{fmtCur(b2b.amount)}</strong> to Paybill <strong>{b2b.paybillNumber || '—'}</strong>{b2b.accountNumber && <> — Acc: <strong>{b2b.accountNumber}</strong></>}</>
                        : <>Sending <strong>{fmtCur(b2b.amount)}</strong> to Till <strong>{b2b.tillNumber || '—'}</strong></>
                      }
                    </div>
                  )}

                  <div className="po-form-footer">
                    <button className="po-initiate-btn" onClick={submitB2B} disabled={!b2bReady}>
                      Initiate B2B Payment
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: navigation panel */}
          <div className="po-nav-panel">
            <div className="po-nav-header">Operations</div>
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                className={`po-nav-item ${view === item.key ? 'active' : ''}`}
                onClick={() => setView(item.key)}
              >
                <span className="po-nav-icon">{item.icon}</span>
                <span className="po-nav-label">{item.label}</span>
                {item.key === 'history' && history.length > 0 && (
                  <span className="po-nav-count">{history.length}</span>
                )}
                {item.key === 'single' || item.key === 'payroll' || item.key === 'b2b' ? (
                  <span className="po-nav-arrow">›</span>
                ) : null}
              </button>
            ))}

            {history.length > 0 && (
              <div className="po-nav-mini-stats">
                <div className="po-mini-stat">
                  <span className="po-mini-dot" style={{ background: '#22c55e' }}></span>
                  <span>{history.filter(h => h.status === 'completed').length} completed</span>
                </div>
                {failedCount > 0 && (
                  <div className="po-mini-stat">
                    <span className="po-mini-dot" style={{ background: '#ef4444' }}></span>
                    <span>{failedCount} failed</span>
                  </div>
                )}
                {pendingCount > 0 && (
                  <div className="po-mini-stat">
                    <span className="po-mini-dot" style={{ background: '#f59e0b' }}></span>
                    <span>{pendingCount} pending</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PIN Modal ───────────────────────────────────────── */}
      {modal && (
        <div className="pin-overlay" onClick={e => e.target === e.currentTarget && !pinExpired && cancelModal()}>
          <div className="pin-modal">
            <div className="pin-modal-head">
              <div className="pin-lock-icon">{pinExpired ? '⏰' : '🔐'}</div>
              <h2>{pinExpired ? 'Approval Window Closed' : 'Director Approval Required'}</h2>
            </div>
            <div className="pin-modal-body">
              {!pinExpired ? (
                <>
                  <p className="pin-desc">
                    An SMS with a <strong>5-digit PIN</strong> has been sent to all directors.
                    Enter it below to authorise this payment.
                  </p>
                  <div className="pin-payout-summary">
                    <div className="pin-summary-row">
                      <span className="psr-label">Type</span>
                      <span className={`po-type-badge ${modal.type}`}>{TYPE_LABEL[modal.type]}</span>
                    </div>
                    <div className="pin-summary-row">
                      <span className="psr-label">Description</span>
                      <span className="psr-val">{modal.label}</span>
                    </div>
                    {modal.amount !== null && (
                      <div className="pin-summary-row">
                        <span className="psr-label">Amount</span>
                        <span className="psr-amount">{fmtCur(modal.amount)}</span>
                      </div>
                    )}
                  </div>
                  <div className={`pin-timer-bar ${timeLeft <= 60 ? 'urgent' : ''}`}>
                    <span>⏱</span><span>PIN expires in</span>
                    <strong className="pin-clock">{fmtTimer(timeLeft)}</strong>
                  </div>
                  <input
                    type="text" inputMode="numeric" maxLength={5} value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="Enter 5-digit PIN" className="pin-input" autoFocus
                  />
                  <div className="pin-modal-actions">
                    <button className="pin-cancel-btn" onClick={cancelModal}>Cancel</button>
                    <button className="pin-auth-btn" onClick={submitPin} disabled={pin.length !== 5}>
                      Authorise Payment
                    </button>
                  </div>
                </>
              ) : (
                <div className="pin-expired-body">
                  <p>The 10-minute approval window has closed. This payment has been cancelled.</p>
                  <p>Please initiate a new payment if you still wish to proceed.</p>
                  <button className="pin-cancel-btn" onClick={() => { setModal(null); setPin(''); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Payouts;
