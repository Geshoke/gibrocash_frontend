import { useEffect, useState, useCallback } from 'react';
import { clientPaymentService, imageService } from '../services/api';

const PAYMENT_METHODS = [
  { value: 'mpesa_paybill', label: 'M-Pesa – Paybill 3576329' },
  { value: 'mpesa_till',    label: 'M-Pesa – other till/paybill' },
  { value: 'mpesa_phone',   label: 'M-Pesa – sent to a phone' },
  { value: 'bank',          label: 'Bank transfer' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'cash',          label: 'Cash' },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]));

// Per-method wording for "where it landed" and the reference field.
const RECEIVED_INTO = {
  mpesa_till:  { label: 'Till / paybill number',     placeholder: 'e.g. Till 123456 – Gibro Hardware' },
  mpesa_phone: { label: 'Received by (name & phone)', placeholder: 'e.g. Director John – 0722 000 000' },
  bank:        { label: 'Bank & account',            placeholder: 'e.g. KCB – Gibro Enterprise Ltd' },
  cheque:      { label: 'Received / deposited by',   placeholder: 'e.g. Accounts – deposited to KCB' },
  cash:        { label: 'Received by',               placeholder: 'e.g. Site foreman – Peter' },
};
const REFERENCE = {
  mpesa_paybill: { label: 'M-Pesa code',    placeholder: 'e.g. UJ91X9RULW' },
  mpesa_till:    { label: 'M-Pesa code',    placeholder: 'e.g. UJ91X9RULW' },
  mpesa_phone:   { label: 'M-Pesa code',    placeholder: 'e.g. UJ91X9RULW' },
  bank:          { label: 'Bank reference', placeholder: 'e.g. FT2610120045' },
  cheque:        { label: 'Cheque number',  placeholder: 'e.g. 000451' },
  cash:          { label: 'Receipt number', placeholder: 'optional' },
};

const fmtCur = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);
const fmtDay = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
// Today in Nairobi, as YYYY-MM-DD
const todayEAT = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const emptyForm = () => ({
  method: 'mpesa_paybill', received_into: '', reference: '', amount: '',
  payer_name: '', payer_phone: '', paid_at: todayEAT(), notes: '',
});

/**
 * Client payments for one project. Only rendered for users with the
 * record_client_payments permission (the backend enforces it as well).
 * Reports the running total through onTotalChange for the summary card.
 */
const ClientPayments = ({ projectId, onTotalChange }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState(null);   // payment being removed
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const { data } = await clientPaymentService.list(projectId);
      setPayments(data.payments || []);
      onTotalChange?.(data.total || 0);
    } catch (err) {
      console.error('Failed to load client payments:', err);
      setLoadError('Could not load client payments.');
      onTotalChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, onTotalChange]);

  useEffect(() => {
    setLoading(true);
    setPayments([]);
    load();
  }, [load]);

  const openRecord = () => {
    setForm(emptyForm());
    setReceiptFile(null);
    setFormError('');
    setRecordOpen(true);
  };

  const submit = async () => {
    const amount = parseFloat(form.amount);
    if (form.method !== 'mpesa_paybill' && !form.received_into.trim()) {
      setFormError(`Enter ${RECEIVED_INTO[form.method].label.toLowerCase()}.`); return;
    }
    if (form.method !== 'cash' && !form.reference.trim()) {
      setFormError(`Enter the ${REFERENCE[form.method].label.toLowerCase()}.`); return;
    }
    if (!(amount > 0)) { setFormError('Enter an amount greater than zero.'); return; }
    if (!form.payer_name.trim()) { setFormError("Enter the payer's name."); return; }
    if (!form.paid_at || form.paid_at > todayEAT()) { setFormError('Enter a valid date that is not in the future.'); return; }

    setSaving(true);
    setFormError('');
    try {
      let receipt_file = null;
      if (receiptFile) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        const { data } = await imageService.upload(fd);
        receipt_file = data.file;
      }
      await clientPaymentService.create(projectId, { ...form, amount, receipt_file });
      setRecordOpen(false);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeReason.trim()) { setRemoveError('A reason is required.'); return; }
    setRemoveBusy(true);
    setRemoveError('');
    try {
      await clientPaymentService.remove(removing.id, removeReason.trim());
      setRemoving(null);
      await load();
    } catch (err) {
      setRemoveError(err.response?.data?.message || 'Failed to remove payment.');
    } finally {
      setRemoveBusy(false);
    }
  };

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="imprests-section cp-section">
      <div className="imprests-section-head">
        <h3>Client Payments ({payments.length})</h3>
        <button className="edit-project-btn" onClick={openRecord}>+ Record Payment</button>
      </div>

      {loading ? (
        <p className="no-data-inline">Loading client payments…</p>
      ) : loadError ? (
        <p className="modal-error">{loadError}</p>
      ) : payments.length === 0 ? (
        <p className="no-data-inline">No client payments recorded for this project.</p>
      ) : (
        <div className="cp-table-wrap">
          <table className="transactions-table compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payer</th>
                <th>Method</th>
                <th>Received into</th>
                <th>Reference</th>
                <th className="cp-num">Amount</th>
                <th>Recorded by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} title={p.notes || undefined}>
                  <td>{fmtDay(p.paid_at)}</td>
                  <td>{p.payer_name}{p.payer_phone && <div className="cp-sub">{p.payer_phone}</div>}</td>
                  <td>{METHOD_LABEL[p.method] || p.method}</td>
                  <td>{p.received_into}</td>
                  <td className="cp-mono">
                    {p.reference || '—'}
                    {p.receipt_file && (
                      <a className="cp-receipt" href={imageService.getImageUrl(p.receipt_file)} target="_blank" rel="noreferrer">receipt</a>
                    )}
                  </td>
                  <td className="cp-num">{fmtCur(p.amount)}</td>
                  <td>{p.recorder?.name || '—'}</td>
                  <td>
                    <button className="cp-remove-btn" title="Remove payment" onClick={() => { setRemoving(p); setRemoveReason(''); setRemoveError(''); }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}><strong>Total received</strong></td>
                <td className="cp-num"><strong>{fmtCur(total)}</strong></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {recordOpen && (
        <div className="modal-overlay" onClick={() => !saving && setRecordOpen(false)}>
          <div className="modal-box ci-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Record Client Payment</h3>
              <button className="modal-close-btn" onClick={() => setRecordOpen(false)} disabled={saving}>×</button>
            </div>
            <div className="modal-form">
              <div className="modal-field">
                <label>Payment method</label>
                <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value, received_into: '' }))}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {form.method !== 'mpesa_paybill' && (
                <div className="modal-field">
                  <label>{RECEIVED_INTO[form.method].label}</label>
                  <input
                    type="text"
                    value={form.received_into}
                    placeholder={RECEIVED_INTO[form.method].placeholder}
                    onChange={e => setForm(f => ({ ...f, received_into: e.target.value }))}
                  />
                </div>
              )}

              <div className="ci-row">
                <div className="modal-field">
                  <label>{REFERENCE[form.method].label}{form.method === 'cash' && <span className="ci-muted"> (optional)</span>}</label>
                  <input
                    type="text"
                    value={form.reference}
                    placeholder={REFERENCE[form.method].placeholder}
                    onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div className="modal-field">
                  <label>Amount (KES)</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="ci-row">
                <div className="modal-field">
                  <label>Paid by</label>
                  <input
                    type="text"
                    value={form.payer_name}
                    placeholder="Client or company name"
                    onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))}
                  />
                </div>
                <div className="modal-field">
                  <label>Payer phone <span className="ci-muted">(optional)</span></label>
                  <input
                    type="text"
                    value={form.payer_phone}
                    placeholder="e.g. 0712 345 678"
                    onChange={e => setForm(f => ({ ...f, payer_phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-field">
                <label>Date paid</label>
                <input
                  type="date"
                  max={todayEAT()}
                  value={form.paid_at}
                  onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))}
                />
              </div>

              <div className="modal-field">
                <label>Notes <span className="ci-muted">(optional)</span></label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="modal-field">
                <label>Receipt image <span className="ci-muted">(optional)</span></label>
                <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files[0] || null)} />
              </div>

              {formError && <p className="modal-error">{formError}</p>}
            </div>
            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setRecordOpen(false)} disabled={saving}>Cancel</button>
              <button className="modal-save-btn" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <div className="modal-overlay" onClick={() => !removeBusy && setRemoving(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Payment</h3>
              <button className="modal-close-btn" onClick={() => setRemoving(null)} disabled={removeBusy}>×</button>
            </div>
            <p className="modal-sub">
              {fmtCur(removing.amount)} from <strong>{removing.payer_name}</strong>
              {removing.reference ? <> · {removing.reference}</> : null}. It will be hidden from this
              project but kept on record with your name and reason. You can record it again correctly afterwards.
            </p>
            <div className="modal-form">
              <div className="modal-field">
                <label>Reason</label>
                <input
                  type="text"
                  autoFocus
                  value={removeReason}
                  placeholder="e.g. Recorded on the wrong project"
                  onChange={e => setRemoveReason(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmRemove()}
                />
              </div>
              {removeError && <p className="modal-error">{removeError}</p>}
            </div>
            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</button>
              <button className="modal-save-btn cp-danger" onClick={confirmRemove} disabled={removeBusy}>
                {removeBusy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPayments;
