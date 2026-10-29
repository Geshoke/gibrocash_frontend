import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { useAuth } from '../context/AuthContext';
import { payoutService, imprestService, transactionService, imageService, projectService, recipientService, savedPayoutService } from '../services/api';
import RecipientPicker from '../components/RecipientPicker';
import SavedPayouts, { LoadedDraftBanner, SaveDraftDialog } from '../components/SavedPayouts';
import { DRAFT_VERSION, buildDraft, checkDraft } from '../utils/payoutDrafts';
import PayoutVoucherPDF from '../components/PayoutVoucherPDF';
import { useTabRefresh } from '../hooks/useTabRefresh';
import './Payouts.css';

// ── Constants ──────────────────────────────────────────────────
const PIN_TIMEOUT_SECS = 180;

// ── Helpers ────────────────────────────────────────────────────
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

/**
 * Normalise a Kenyan phone number to the 254XXXXXXXXX format
 * required by the M-Pesa B2C API.
 */
const normalizePhone = (raw) => {
  let p = String(raw).trim().replace(/[\s\-().]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  // 07xx or 01xx → 254xx
  if (/^0[17]/.test(p)) p = '254' + p.slice(1);
  // bare 7xxxxxxxx or 1xxxxxxxx (9 digits)
  if (/^[17]\d{8}$/.test(p)) p = '254' + p;
  return p;
};

const isValidPhone = (p) => /^254[17]\d{8}$/.test(normalizePhone(p));

const STATUS_META = {
  pending_pin: { label: 'Awaiting PIN', cls: 'pending',    dot: '#f59e0b' },
  processing:  { label: 'Processing',   cls: 'processing', dot: '#3b82f6' },
  completed:   { label: 'Completed',    cls: 'completed',  dot: '#22c55e' },
  failed:      { label: 'Failed',       cls: 'failed',     dot: '#ef4444' },
  expired:     { label: 'PIN Expired',  cls: 'expired',    dot: '#6b7280' },
  cancelled:   { label: 'Cancelled',    cls: 'cancelled',  dot: '#6b7280' },
};

const VAT_RATE = 0.16;

const TYPE_LABEL = { payroll: 'Payroll', single: 'Single Payment', b2b: 'B2B Payment', txn_payout: 'Transaction Payout', batch_payout: 'Batch Payout' };

// ── Payment voucher builders ─────────────────────────────────────
// Voucher numbers are derived entirely from data already on the ledger
// entry (its id) — no backend column or migration needed.
const buildVoucher = (entry) => ({
  voucherNumber:      `PV-${String(entry.id).toUpperCase()}`,
  date:               entry.date,
  status:             entry.status,
  type:               entry.type,
  description:        entry.label,
  amount:             entry.amount,
  initiatedBy:        entry.initiatedBy,
  recipientName:      entry.payload?.receiverPublicName || null,
  recipientPhone:     entry.payload?.partyB || null,
  mpesaCode:          entry.payload?.transactionReceipt || null,
  accountReference:   entry.payload?.accountReference || null,
  destinationAccount: entry.payload?.destinationAccount || null,
});

const buildPayrollRowVoucher = (entry, row) => ({
  voucherNumber:  `PV-${String(entry.id).toUpperCase()}-${String(row.staffNo || row._id || '').toUpperCase()}`,
  date:           entry.date,
  status:         entry.status,
  type:           'payroll',
  description:    row.name ? `${entry.label} — ${row.name}` : entry.label,
  amount:         row.netPay,
  initiatedBy:    entry.initiatedBy,
  recipientName:  row.name || null,
  recipientPhone: row.resolvedPhone || null,
  mpesaCode:      row.transactionReceipt || row.code || null,
  staffNo:        row.staffNo || null,
});

const NAV_ITEMS = [
  { key: 'payroll',     icon: '💰', label: 'Payroll'             },
  { key: 'single',      icon: '📤', label: 'Single Payment'      },
  { key: 'b2b',         icon: '🏦', label: 'B2B Payment'         },
  { key: 'txn_payout',  icon: '💳', label: 'Transaction Payout'  },
  { key: 'saved',       icon: '🔖', label: 'Saved'               },
  { key: 'contacts',    icon: '👥', label: 'Contacts'            },
  { key: 'history',     icon: '📋', label: 'History'             },
];

// ── Helpers ────────────────────────────────────────────────────
const getTxnTotals = (form) => {
  const qty      = parseFloat(form.quantity)  || 0;
  const unit     = parseFloat(form.unitPrice) || 0;
  const subtotal = qty * unit;
  const vat      = form.vatEnabled ? parseFloat((subtotal * VAT_RATE).toFixed(2)) : 0;
  const total    = parseFloat((subtotal + vat).toFixed(2));
  return { subtotal, vat, total };
};

// ── Component ──────────────────────────────────────────────────
const Payouts = () => {
  const { user, canEditContacts, canDeleteSavedPayouts } = useAuth();
  const [view, setView] = useState('history');

  // ── Contacts (backend-backed recipient directory) ────────────
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactForm, setContactForm] = useState({ staffNo: '', name: '', phoneNumber: '' });
  const [contactError, setContactError] = useState('');

  const fetchContacts = async (silent = false) => {
    try {
      if (!silent) setContactsLoading(true);
      const { data } = await recipientService.getAll();
      const rows = (data.contacts || []).map(c => ({
        id: c.id, staffNo: c.staff_no || '', name: c.name, phoneNumber: c.phone,
      }));
      setContacts(rows);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      if (!silent) setContactsLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, []);

  // ── Payroll (Excel import) ───────────────────────────────────
  const [payrollName, setPayrollName] = useState('');
  // xlsxRows: [{ _id, staffNo, name, netPay, phone }]  phone = auto-matched from contacts
  const [xlsxRows, setXlsxRows]       = useState([]);
  // inlinePhones: { [_id]: string }  overrides per-row phone entered by the user
  const [inlinePhones, setInlinePhones] = useState({});
  const [xlsxError, setXlsxError]     = useState('');

  // ── Single ───────────────────────────────────────────────────
  const [single, setSingle] = useState({ contact: '', amount: '', description: '' });

  // ── B2B ──────────────────────────────────────────────────────
  const [b2bType, setB2bType] = useState('paybill');
  const [b2b, setB2b] = useState({ paybillNumber: '', accountNumber: '', tillNumber: '', amount: '' });

  // ── PIN modal ────────────────────────────────────────────────
  const [modal, setModal]           = useState(null);
  const [pin, setPin]               = useState('');
  const [timeLeft, setTimeLeft]     = useState(PIN_TIMEOUT_SECS);
  const [pinExpired, setPinExpired] = useState(false);
  const [pinError, setPinError]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const modalRef = useRef(null);
  const timerRef = useRef(null);

  // ── History ──────────────────────────────────────────────────
  const [history, setHistory]       = useState([]);
  const [expanded, setExpanded]     = useState(null);
  // Line items of batch payouts, by M-Pesa code: { loading, error, transactions, total }
  const [batchLines, setBatchLines] = useState({});
  const [historyPage, setHistoryPage]         = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const [voucher, setVoucher]       = useState(null);

  // ── Projects ─────────────────────────────────────────────────
  const [projects, setProjects]             = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearch, setProjectSearch]   = useState('');
  const [projectOpen, setProjectOpen]       = useState(false);
  const projectRef                          = useRef(null);

  // ── Transaction Payout ───────────────────────────────────────
  // Transaction payouts are always recorded in the project's Expenses imprest. Choosing a
  // specific imprest was removed: those payouts raised used without raising allocated.
  const [txnPayout, setTxnPayout]           = useState({ projectId: '', contact: '', amount: '', description: '' });
  const [txnRequesting, setTxnRequesting]   = useState(false);
  const [txnSuccess, setTxnSuccess]         = useState('');

  // ── Batch Payout ─────────────────────────────────────────────
  const [txnMode, setTxnMode]                       = useState('single');
  const [batchItems, setBatchItems]                 = useState([]);
  const [batchForm, setBatchForm]                   = useState({ projectId: '', projectName: '', amount: '', description: '' });
  const [batchPhone, setBatchPhone]                 = useState('');
  const [batchRequesting, setBatchRequesting]       = useState(false);
  const [batchItemError, setBatchItemError]         = useState('');
  const [batchSubmitError, setBatchSubmitError]     = useState('');
  const [batchProjectSearch, setBatchProjectSearch] = useState('');
  const [batchProjectOpen, setBatchProjectOpen]     = useState(false);
  const batchProjectRef                             = useRef(null);

  // ── PIN modal step 2 — record transaction ───────────────────
  const [modalStep, setModalStep]         = useState('pin'); // 'pin' | 'polling' | 'record' | 'failed'
  const [txnForm, setTxnForm]             = useState({ item: '', vatEnabled: false });
  const [txnImageFile, setTxnImageFile]   = useState(null);
  const [txnSaving, setTxnSaving]         = useState(false);
  const [txnFormError, setTxnFormError]   = useState('');

  // ── B2C polling ───────────────────────────────────────────────
  const [ocid, setOcid]               = useState(null);
  const [pollingError, setPollingError] = useState('');
  const [showPollEscape, setShowPollEscape] = useState(false);
  const pollRef                         = useRef(null);
  const pollEscapeTimerRef              = useRef(null);

  // ── Account balance (last-known from B2C callbacks) ──────────
  const [balance, setBalance] = useState({ workingAccountFunds: null, utilityAccountFunds: null, asOf: null });

  // ── Failed imprest-transaction ledger (localStorage) ────────
  const [failedTxns, setFailedTxns] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gibrocash_failed_txns') || '[]'); }
    catch { return []; }
  });

  // ── Server-sourced unrecorded txn_payouts (persistent, survives browser close) ──
  const [serverFailedTxns, setServerFailedTxns] = useState([]);

  // ── Saved payouts (drafts held for later instead of transacting) ──
  const [savedPayouts, setSavedPayouts]       = useState([]);
  const [savedLoading, setSavedLoading]       = useState(true);
  const [savedBusyId, setSavedBusyId]         = useState(null);
  const [savedNotice, setSavedNotice]         = useState(null);   // { kind: 'success'|'warn', text }
  // The draft currently filled into a form: { draft, warnings }. Paying that form uses it up.
  const [loadedDraft, setLoadedDraft]         = useState(null);
  const [draftError, setDraftError]           = useState('');
  const [saveDialogType, setSaveDialogType]   = useState(null);   // payout type being saved, or null
  const [savingDraft, setSavingDraft]         = useState(false);
  const [saveDraftError, setSaveDraftError]   = useState('');
  const settlingRef                           = useRef(false);

  // ── Retry modal ──────────────────────────────────────────────
  const [retryEntry, setRetryEntry]       = useState(null);
  const [retryForm, setRetryForm]         = useState({ item: '', quantity: '1', unitPrice: '', vatEnabled: false });
  const [retryImageFile, setRetryImageFile] = useState(null);
  const [retrying, setRetrying]           = useState(false);
  const [retryError, setRetryError]       = useState('');

  const openRetry = (entry) => {
    const d = entry.transactionData;
    // Back-calculate whether VAT was on: vat_charged > 0
    setRetryForm({
      item:       d.item       || '',
      quantity:   String(d.itemQuantity || 1),
      unitPrice:  String(d.unitPrice    || ''),
      vatEnabled: (d.vat_charged || 0) > 0,
    });
    setRetryImageFile(null);
    setRetryError('');
    setRetryEntry(entry);
  };

  const mapDbStatus = (s) => {
    if (s === 'success') return 'completed';
    if (s === 'pending') return 'processing';
    return 'failed'; // failed, timeout
  };

  const toggleBatchPayout = (entry) => {
    const opening = expanded !== entry.id;
    setExpanded(opening ? entry.id : null);
    const code = entry.payload?.transactionReceipt;
    if (!opening || !code || (batchLines[code] && !batchLines[code].error)) return;
    setBatchLines(prev => ({ ...prev, [code]: { loading: true } }));
    transactionService.getByMpesaCode(code)
      .then(({ data }) => setBatchLines(prev => ({ ...prev, [code]: { transactions: data.transactions || [], total: data.total || 0 } })))
      .catch(() => setBatchLines(prev => ({ ...prev, [code]: { error: 'Could not load the items in this batch.' } })));
  };

  const renderBatchPayoutItems = (entry) => {
    const code = entry.payload?.transactionReceipt;
    if (!code) {
      return (
        <p className="po-batch-note">
          {entry.status === 'completed'
            ? 'No M-Pesa code was saved for this payment, so its items can’t be matched.'
            : 'Items are recorded once M-Pesa confirms the payment.'}
        </p>
      );
    }
    const lines = batchLines[code];
    if (!lines || lines.loading) return <p className="po-batch-note">Loading items…</p>;
    if (lines.error) return <p className="po-batch-note error">{lines.error}</p>;
    if (lines.transactions.length === 0) {
      return <p className="po-batch-note error">No transactions are recorded against {code}. Check Action Required.</p>;
    }
    const gap = Math.round(((entry.amount || 0) - lines.total) * 100) / 100;
    return (
      <>
        <table className="po-table po-sub-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Project</th>
              <th>Imprest</th>
              <th>Recorded by</th>
              <th>Receipt</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.transactions.map((t, i) => (
              <tr key={t.id}>
                <td className="td-mono">{i + 1}</td>
                <td>{t.item}</td>
                <td>{t.imprest?.project?.name || '—'}</td>
                <td>{t.imprest?.name || '—'}</td>
                <td>{t.user?.name || '—'}</td>
                <td>
                  <span className={`po-receipt-badge ${t.image?.url ? 'has' : 'missing'}`}>
                    {t.image?.url ? 'Attached' : 'Missing'}
                  </span>
                </td>
                <td className="td-amount">{fmtCur(parseFloat(t.price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="po-batch-footer">
          <span className="td-mono">M-Pesa {code}</span>
          <span>
            {lines.transactions.length} item{lines.transactions.length !== 1 ? 's' : ''} · recorded {fmtCur(lines.total)} of {fmtCur(entry.amount)} paid
          </span>
          {Math.abs(gap) >= 0.01 && (
            <span className="po-batch-gap">
              {gap > 0 ? `${fmtCur(gap)} not recorded — check Action Required` : `${fmtCur(-gap)} more recorded than paid`}
            </span>
          )}
          <button className="po-batch-voucher-btn" onClick={() => setVoucher(buildVoucher(entry))}>🧾 Voucher</button>
        </div>
      </>
    );
  };

  const fetchLedger = () => {
    Promise.allSettled([
      payoutService.getPayments(),
      payoutService.getB2bPayments(),
    ]).then(([b2cResult, b2bResult]) => {
      const b2cPayments = b2cResult.status === 'fulfilled'
        ? (b2cResult.value.data.payments || []).map(p => ({
            id:          `b2c-${p.id}`,
            type:        p.occasion || 'single',
            label:       p.description || p.remarks || '—',
            amount:      parseFloat(p.amount),
            date:        p.initiatedAt,
            status:      mapDbStatus(p.status),
            initiatedBy: p.initiatedBy || null,
            payload: {
              partyB:             p.partyB,
              transactionReceipt: p.transactionReceipt,
              receiverPublicName: p.receiverPublicName,
            },
          }))
        : [];

      const b2bPayments = b2bResult.status === 'fulfilled'
        ? (b2bResult.value.data.payments || []).map(p => ({
            id:          `b2b-${p.id}`,
            type:        'b2b',
            label:       p.remarks || '—',
            amount:      parseFloat(p.amount),
            date:        p.initiatedAt,
            status:      mapDbStatus(p.status),
            initiatedBy: p.initiatedBy || null,
            payload: {
              partyB:             p.partyB,
              accountReference:   p.accountReference,
              destinationAccount: p.destinationAccount,
              commandId:          p.commandId,
              transactionReceipt: p.transactionReceipt,
            },
          }))
        : [];

      const merged = [...b2cPayments, ...b2bPayments]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      setHistory(merged);
    });
  };

  const fetchBalance = async () => {
    try {
      const { data } = await payoutService.getBalance();
      setBalance(data);
    } catch { /* balance display is best-effort */ }
  };

  const fetchUnrecordedTxnPayouts = async () => {
    try {
      const { data } = await payoutService.getUnrecordedTxnPayouts();
      const entries = (data.payments || []).map(p => ({
        id: `server-${p.originatorConversationId}`,
        createdAt: p.initiatedAt,
        payoutLabel: p.remarks || '—',
        payoutAmount: parseFloat(p.amount),
        imprestName: p.payoutMeta?.imprestName || 'Expenses',
        imprestProject: p.payoutMeta?.imprestProject || null,
        isServerEntry: true,
        originatorConversationId: p.originatorConversationId,
        financeTransactionId: p.payoutMeta?.financeTransactionId || null,
        mpesaCode: p.transactionReceipt || null,
        mpesaPhone: p.partyB || null,
        mpesaRecipientName: p.receiverPublicName || null,
        transactionData: {
          imprestAccount_id: p.payoutMeta?.imprestId   || null,
          projectId:         p.payoutMeta?.projectId   || null,
          item:              p.payoutMeta?.description || '',
          itemQuantity:      1,
          unitPrice:         parseFloat(p.amount),
          Total_amount:      parseFloat(p.amount),
          userID:            p.payoutMeta?.userId      || null,
          vat_charged:       0,
          url_image:         null,
          mpesa_code:            p.transactionReceipt || null,
          mpesa_recipient_phone: p.partyB || null,
          mpesa_recipient_name:  p.receiverPublicName || null,
        },
      }));
      setServerFailedTxns(entries);
    } catch { /* silent — server entries are a recovery aid, not critical */ }
  };

  // ── Saved payouts ────────────────────────────────────────────
  const showSavedNotice = (kind, text, ms = 8000) => {
    setSavedNotice({ kind, text });
    if (ms) setTimeout(() => setSavedNotice(n => (n?.text === text ? null : n)), ms);
  };

  // Drafts whose PIN was accepted are "submitted" until Safaricom answers. Whoever has
  // the list open settles them — this is what finishes a Single payment (which doesn't
  // wait in the modal) and any payout whose browser was closed mid-flow.
  const settleSubmittedDrafts = async (rows) => {
    if (settlingRef.current) return;
    const pending = rows.filter(r => r.status === 'submitted' && r.originator_conversation_id);
    if (pending.length === 0) return;
    settlingRef.current = true;
    let changed = false;
    try {
      for (const r of pending) {
        try {
          const { data } = await payoutService.checkB2cStatus(r.originator_conversation_id);
          const outcome = data.status === 'success' ? 'paid'
            : (data.status === 'failed' || data.status === 'timeout') ? 'failed'
            : null;
          if (!outcome) continue;
          await savedPayoutService.resolve(r.id, outcome, r.originator_conversation_id);
          changed = true;
          if (outcome === 'failed') {
            showSavedNotice('warn', `Payment for saved payout "${r.name}" failed — it is back in Saved.`);
          }
        } catch { /* try again on the next refresh */ }
      }
    } finally {
      settlingRef.current = false;
    }
    if (changed) fetchSavedPayouts(true);
  };

  const fetchSavedPayouts = async (silent = false) => {
    try {
      if (!silent) setSavedLoading(true);
      const { data } = await savedPayoutService.getAll();
      const rows = data.savedPayouts || [];
      setSavedPayouts(rows);
      settleSubmittedDrafts(rows);
    } catch (err) {
      console.error('Failed to load saved payouts:', err);
    } finally {
      if (!silent) setSavedLoading(false);
    }
  };

  // Refresh whenever Saved is opened, so locks taken by other users show up.
  useEffect(() => { if (view === 'saved') fetchSavedPayouts(true); }, [view]); // eslint-disable-line

  // Keep checking while any draft is waiting on Safaricom.
  useEffect(() => {
    if (!savedPayouts.some(d => d.status === 'submitted')) return;
    const t = setInterval(() => fetchSavedPayouts(true), 15000);
    return () => clearInterval(t);
  }, [savedPayouts]); // eslint-disable-line

  const currentFormState = (type) => {
    if (type === 'single') return single;
    if (type === 'txn_payout') return txnPayout;
    return { items: batchItems, phone: batchPhone };
  };

  const openSaveDialog = (type) => {
    setSaveDraftError('');
    setSaveDialogType(type);
  };

  const clearForm = (type) => {
    if (type === 'single') setSingle({ contact: '', amount: '', description: '' });
    if (type === 'txn_payout') {
      setTxnPayout({ projectId: '', contact: '', amount: '', description: '' });
      setProjectSearch('');
    }
    if (type === 'batch_payout') { setBatchItems([]); setBatchPhone(''); setBatchSubmitError(''); }
  };

  // Saving a form that holds a loaded draft of the same type overwrites that draft.
  const handleSaveDraft = async (name) => {
    const type = saveDialogType;
    const built = buildDraft(type, currentFormState(type), { projects, contacts });
    if (built.error) { setSaveDraftError(built.error); return; }
    const overwriting = loadedDraft?.draft.type === type ? loadedDraft.draft : null;
    setSavingDraft(true);
    setSaveDraftError('');
    try {
      const body = { name, form_data: built.form_data, form_version: DRAFT_VERSION, amount: built.amount };
      if (overwriting) await savedPayoutService.update(overwriting.id, body);
      else await savedPayoutService.create({ ...body, type });
      setSaveDialogType(null);
      clearForm(type);
      if (overwriting) setLoadedDraft(null);
      setDraftError('');
      showSavedNotice('success', overwriting ? `Saved payout "${name}" updated.` : `Saved "${name}" for later.`);
      fetchSavedPayouts(true);
    } catch (err) {
      setSaveDraftError(err.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setSavingDraft(false);
    }
  };

  const formHasData = (type) => {
    if (type === 'single') return !!(single.contact || single.amount || single.description);
    if (type === 'txn_payout') return !!(txnPayout.projectId || txnPayout.contact || txnPayout.amount || txnPayout.description);
    return batchItems.length > 0 || !!batchPhone;
  };

  const handleLoadDraft = async (draft) => {
    if (formHasData(draft.type) && loadedDraft?.draft.id !== draft.id &&
        !window.confirm('The form for this payout type already has details in it. Replace them with the saved payout?')) {
      return;
    }
    setSavedBusyId(draft.id);
    try {
      const projList = draft.type !== 'single' ? await ensureProjects({ fresh: true }) : projects;
      const { form, warnings } = checkDraft(draft, { projects: projList, contacts });
      if (!form) { showSavedNotice('warn', warnings.join(' ')); return; }

      if (draft.type === 'single') {
        setSingle(form);
        setView('single');
      } else if (draft.type === 'txn_payout') {
        const { projectLabel, ...fields } = form;
        setTxnPayout(fields);
        setProjectSearch(projectLabel);
        setTxnMode('single');
        setView('txn_payout');
      } else {
        setBatchItems(form.items);
        setBatchPhone(form.phone);
        setBatchSubmitError('');
        setTxnMode('batch');
        setView('txn_payout');
      }
      setLoadedDraft({ draft, warnings });
      setDraftError('');
    } finally {
      setSavedBusyId(null);
    }
  };

  const handleRenameDraft = async (draft, name) => {
    setSavedBusyId(draft.id);
    try {
      await savedPayoutService.update(draft.id, { name });
      if (loadedDraft?.draft.id === draft.id) {
        setLoadedDraft(ld => ({ ...ld, draft: { ...ld.draft, name } }));
      }
      fetchSavedPayouts(true);
      return null;
    } catch (err) {
      return err.response?.data?.message || 'Rename failed. Please try again.';
    } finally {
      setSavedBusyId(null);
    }
  };

  const handleDiscardDraft = async (draft) => {
    if (!window.confirm(`Discard saved payout "${draft.name}"? It will be removed from Saved.`)) return;
    setSavedBusyId(draft.id);
    try {
      await savedPayoutService.discard(draft.id);
      if (loadedDraft?.draft.id === draft.id) setLoadedDraft(null);
      showSavedNotice('success', `Discarded "${draft.name}".`);
    } catch (err) {
      showSavedNotice('warn', err.response?.data?.message || 'Discard failed. Please try again.');
    } finally {
      setSavedBusyId(null);
      fetchSavedPayouts(true);
    }
  };

  const detachDraft = () => { setLoadedDraft(null); setDraftError(''); };

  // Before requesting a PIN for a form that holds a loaded draft, lock the draft so
  // nobody else can pay it at the same time. Returns the draft id, null when the form
  // has no draft of this type, or false when the lock was refused (error shown).
  const claimLoadedDraft = async (type) => {
    if (!loadedDraft || loadedDraft.draft.type !== type) return null;
    try {
      await savedPayoutService.claim(loadedDraft.draft.id);
      setDraftError('');
      return loadedDraft.draft.id;
    } catch (err) {
      setDraftError(err.response?.data?.message || 'Could not reserve this saved payout. Please try again.');
      fetchSavedPayouts(true);
      return false;
    }
  };

  const releaseDraft = (draftId) => {
    if (!draftId) return;
    savedPayoutService.release(draftId).catch(() => {}).finally(() => fetchSavedPayouts(true));
  };

  // PIN accepted — link the draft to the M-Pesa payment. Retried because if this is lost
  // the claim lapses and the draft could be paid a second time.
  const markDraftSubmitted = async (draftId, originatorConversationId) => {
    if (!draftId) return;
    const name = loadedDraft?.draft.id === draftId ? loadedDraft.draft.name : 'this payout';
    if (originatorConversationId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await savedPayoutService.submit(draftId, originatorConversationId);
          fetchSavedPayouts(true);
          return;
        } catch {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
    showSavedNotice('warn',
      `Payment sent, but saved payout "${name}" could not be marked as used. Discard it from Saved so it isn't paid twice.`, 0);
    fetchSavedPayouts(true);
  };

  useEffect(() => { fetchLedger(); fetchBalance(); fetchUnrecordedTxnPayouts(); fetchSavedPayouts(); }, []); // eslint-disable-line

  useTabRefresh('/payouts', () => {
    fetchLedger();
    fetchContacts(true);
    fetchBalance();
    fetchUnrecordedTxnPayouts();
    fetchSavedPayouts(true);
  });

  // Persist failed txn ledger
  useEffect(() => {
    localStorage.setItem('gibrocash_failed_txns', JSON.stringify(failedTxns));
  }, [failedTxns]);

  // Close project dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (projectRef.current && !projectRef.current.contains(e.target)) {
        setProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close batch dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (batchProjectRef.current && !batchProjectRef.current.contains(e.target)) setBatchProjectOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Projects are loaded on demand and cached. This returns a promise of the list (null if
  // the fetch failed) so a saved payout can wait for it before it is checked and filled in.
  const projectsPromiseRef = useRef(null);

  const ensureProjects = ({ fresh = false } = {}) => {
    if (fresh || !projectsPromiseRef.current) {
      setProjectsLoading(true);
      projectsPromiseRef.current = projectService.getAll()
        .then(({ data }) => { const list = data.projects || []; setProjects(list); return list; })
        .catch(() => { projectsPromiseRef.current = null; return null; })
        .finally(() => setProjectsLoading(false));
    }
    return projectsPromiseRef.current;
  };

  // Load projects when Transaction Payout view is opened
  useEffect(() => {
    if (view === 'txn_payout') ensureProjects();
  }, [view]);

  useEffect(() => { modalRef.current = modal; }, [modal]);

  // B2C status polling — runs while modalStep === 'polling'
  useEffect(() => {
    if (modalStep !== 'polling' || !ocid) return;

    setShowPollEscape(false);
    pollEscapeTimerRef.current = setTimeout(() => setShowPollEscape(true), 60000);

    // Settle the saved payout this payment came from. A failed payment puts the draft
    // back (the form still holds it, so the user can retry); a paid one is used up.
    const settleModalDraft = (outcome) => {
      const draftId = modalRef.current?.draftId;
      if (!draftId) return;
      savedPayoutService.resolve(draftId, outcome, ocid)
        .catch(() => {})
        .finally(() => fetchSavedPayouts(true));
      if (outcome === 'paid') setLoadedDraft(null);
    };

    const resolveImprestAndProceed = async (mpesaInfo) => {
      const { code: mpesaCode, phone: mpesaPhone, name: mpesaRecipientName } = mpesaInfo || {};
      const m = modalRef.current;

      // ── Batch payout: auto-record each line item ──────────────
      if (m?.type === 'batch_payout') {
        setModalStep('batch_recording');
        const items = m.payload.batchItems || [];
        const newFailed = [];

        for (const item of items) {
          let imprestId = item.imprestId || null;
          const imprestName = item.imprestName || 'Expenses';

          if (!imprestId && item.projectId) {
            try {
              const { data } = await imprestService.findOrCreateExpenses({
                project_id: item.projectId,
                amount: item.amount,
                createdBy: user.id,
              });
              imprestId = data.imprest.id;
            } catch {
              newFailed.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                createdAt: new Date().toISOString(),
                payoutLabel: m.label,
                payoutAmount: item.amount,
                imprestName,
                imprestProject: item.projectName || null,
                transactionData: { imprestAccount_id: null, item: item.description, itemQuantity: 1, unitPrice: item.amount, Total_amount: item.amount, userID: user.id, vat_charged: 0, url_image: null, mpesa_code: mpesaCode, mpesa_recipient_phone: mpesaPhone, mpesa_recipient_name: mpesaRecipientName },
              });
              continue;
            }
          }

          try {
            await transactionService.create({
              imprestAccount_id: imprestId,
              item: item.description,
              itemQuantity: 1,
              unitPrice: item.amount,
              Total_amount: item.amount,
              userID: user.id,
              vat_charged: 0,
              url_image: null,
              mpesa_code: mpesaCode,
              mpesa_recipient_phone: mpesaPhone,
              mpesa_recipient_name: mpesaRecipientName,
            });
          } catch {
            newFailed.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              createdAt: new Date().toISOString(),
              payoutLabel: m.label,
              payoutAmount: item.amount,
              imprestName,
              imprestProject: item.projectName || null,
              transactionData: { imprestAccount_id: imprestId, item: item.description, itemQuantity: 1, unitPrice: item.amount, Total_amount: item.amount, userID: user.id, vat_charged: 0, url_image: null, mpesa_code: mpesaCode, mpesa_recipient_phone: mpesaPhone, mpesa_recipient_name: mpesaRecipientName },
            });
          }
        }

        if (newFailed.length > 0) setFailedTxns(prev => [...newFailed, ...prev]);
        const succeeded = items.length - newFailed.length;
        setModal(null);
        setModalStep('pin');
        setOcid(null);
        setBatchItems([]);
        setBatchPhone('');
        fetchLedger();
        const msg = succeeded === items.length
          ? `Batch payout complete — ${succeeded} transaction${succeeded !== 1 ? 's' : ''} recorded.`
          : `Batch payout complete — ${succeeded} of ${items.length} recorded. Check Action Required for the rest.`;
        setTxnSuccess(msg);
        setTimeout(() => setTxnSuccess(''), 8000);
        return;
      }

      // ── Single txn_payout ─────────────────────────────────────
      setModal(prev => (prev ? { ...prev, payload: { ...prev.payload, mpesaCode, mpesaPhone, mpesaRecipientName } } : prev));

      let imprest = m?.payload?.imprest || null;

      if (!imprest && m?.payload?.projectId) {
        try {
          const { data } = await imprestService.findOrCreateExpenses({
            project_id: m.payload.projectId,
            amount: m.amount,
            createdBy: user.id,
          });
          const proj = projects.find(p => p.id === m.payload.projectId);
          imprest = { id: data.imprest.id, name: 'Expenses', projectName: proj?.name || null };
          setModal(prev => ({ ...prev, payload: { ...prev.payload, imprest } }));
        } catch {
          setPollingError('Payment succeeded but could not create expense record.');
          setModalStep('failed');
          return;
        }
      }

      setTxnForm({ item: m?.payload?.description || '', vatEnabled: false });
      setTxnImageFile(null);
      setTxnFormError('');
      setModalStep('record');
    };

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await payoutService.checkB2cStatus(ocid);
        if (data.status === 'success') {
          clearInterval(pollRef.current);
          fetchLedger(); // update ledger immediately on confirmed success
          settleModalDraft('paid');
          await resolveImprestAndProceed({
            code: data.transactionReceipt || null,
            phone: data.partyB || null,
            name: data.receiverPublicName || null,
          });
        } else if (data.status === 'failed' || data.status === 'timeout') {
          clearInterval(pollRef.current);
          fetchLedger();
          settleModalDraft('failed');
          setPollingError(data.resultDesc || 'Payment failed or timed out by Safaricom.');
          setModalStep('failed');
        }
      } catch { /* network blip — keep polling */ }
    }, 3000);

    return () => {
      clearInterval(pollRef.current);
      clearTimeout(pollEscapeTimerRef.current);
    };
  }, [modalStep, ocid]); // eslint-disable-line

  useEffect(() => {
    if (!modal || pinExpired) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setPinExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [modal]); // eslint-disable-line

  // ── Derived stats ────────────────────────────────────────────
  const totalDisbursed = history.filter(h => h.status === 'completed').reduce((s, h) => s + (h.amount || 0), 0);
  const pendingCount   = history.filter(h => h.status === 'pending_pin' || h.status === 'processing').length;
  const settledToday   = history.filter(h => h.status === 'completed' && isToday(h.date)).reduce((s, h) => s + (h.amount || 0), 0);
  const failedCount    = history.filter(h => h.status === 'failed' || h.status === 'expired').length;

  // ── Modal helpers ────────────────────────────────────────────
  // draftId: the saved payout this payment uses up (already claimed), if any
  const openModal = (type, label, amount, payload, payoutId, draftId = null) => {
    clearInterval(timerRef.current);
    setModal({ id: Date.now().toString(), type, label, amount, payload, payoutId, draftId });
    setPin(''); setTimeLeft(PIN_TIMEOUT_SECS); setPinExpired(false); setPinError('');
  };

  const cancelModal = () => {
    clearInterval(timerRef.current);
    releaseDraft(modal?.draftId);
    setModal(null); setPin('');
    fetchLedger();
  };

  // Dismiss the "waiting on Safaricom" modal without losing track of the payout.
  // The PIN has already been authorised — money may already be moving — so this
  // does not cancel anything server-side. It just stops the client-side poll and
  // relies on the server-tracked unrecorded-payouts list to surface the result
  // (same recovery path used when the browser closes mid-flow).
  const escapePolling = () => {
    clearInterval(pollRef.current);
    clearTimeout(pollEscapeTimerRef.current);
    setModal(null);
    setModalStep('pin');
    setOcid(null);
    setPollingError('');
    setShowPollEscape(false);
    fetchLedger();
    fetchUnrecordedTxnPayouts();
  };

  const submitPin = async () => {
    if (pin.length !== 5 || pinExpired || submitting) return;
    setSubmitting(true);
    setPinError('');
    const m = { ...modal };
    try {
      const authResponse = await payoutService.authorise(m.payoutId, pin);

      // Transaction Payout / Batch Payout: move to polling — wait for Safaricom B2C confirmation
      if (m.type === 'txn_payout' || m.type === 'batch_payout') {
        clearInterval(timerRef.current);
        setPin(''); setPinError('');
        setPollingError('');
        // authorise returns { success, result: { originatorConversationId, conversationId } }
        const originatorConversationId = authResponse?.data?.result?.originatorConversationId || null;
        markDraftSubmitted(m.draftId, originatorConversationId);
        setOcid(originatorConversationId);
        setModalStep('polling');
        setSubmitting(false);
        return;
      }

      clearInterval(timerRef.current);
      setModal(null); setPin('');
      fetchLedger();
      if (m.type === 'payroll') { setXlsxRows([]); setPayrollName(''); setInlinePhones({}); }
      if (m.type === 'single') {
        setSingle({ contact: '', amount: '', description: '' });
        // A Single payment doesn't wait for Safaricom here — the draft settles in the
        // background once the saved list sees the result (see settleSubmittedDrafts).
        if (m.draftId) {
          markDraftSubmitted(m.draftId, authResponse?.data?.result?.originatorConversationId || null);
          setLoadedDraft(null);
        }
      }
      if (m.type === 'b2b')     setB2b({ paybillNumber: '', accountNumber: '', tillNumber: '', amount: '' });
      setView('history');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setPinError('Incorrect PIN. Please try again.');
      } else if (status === 410) {
        clearInterval(timerRef.current);
        setPinExpired(true);
        // PIN expired — no local history push needed; ledger refreshed on close
      } else {
        setPinError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Excel (XLSX) import ──────────────────────────────────────
  const handleXLSX = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fname = file.name.toLowerCase();
    if (!fname.endsWith('.xlsx') && !fname.endsWith('.xls')) {
      setXlsxError('Please upload an Excel file (.xlsx or .xls).');
      return;
    }
    setXlsxError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb  = XLSX.read(ev.target.result, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find the header row (must contain "Employee Name")
        let headerRow = -1;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].some(cell => /employee name/i.test(String(cell)))) {
            headerRow = i; break;
          }
        }
        if (headerRow === -1) {
          setXlsxError('Could not find employee data. Expected an "Employee Name" column.');
          return;
        }

        const headers   = raw[headerRow].map(h => String(h).trim());
        const nameIdx   = headers.findIndex(h => /employee name/i.test(h));
        const staffIdx  = headers.findIndex(h => /staff no/i.test(h));
        const netPayIdx = headers.findIndex(h => /net pay/i.test(h));

        if (nameIdx === -1 || netPayIdx === -1) {
          setXlsxError('Missing required columns: "Employee Name" and "Net Pay".');
          return;
        }

        const employees = [];
        for (let i = headerRow + 1; i < raw.length; i++) {
          const row    = raw[i];
          const name   = String(row[nameIdx]  ?? '').trim();
          const staffNo = staffIdx >= 0 ? String(row[staffIdx] ?? '').replace(/\.0$/, '').trim() : '';
          const netPay = parseFloat(row[netPayIdx]) || 0;

          // Skip blank rows, the grand totals row, and zero-pay rows
          if (!name || /grand total/i.test(name) || netPay <= 0) continue;

          // Auto-match a saved contact: prefer Staff No match, fall back to name match
          const match = contacts.find(c =>
            (staffNo && c.staffNo && String(c.staffNo).trim() === staffNo) ||
            c.name.trim().toLowerCase() === name.toLowerCase()
          );

          employees.push({ _id: i, staffNo, name, netPay, phone: match?.phoneNumber || '' });
        }

        if (employees.length === 0) {
          setXlsxError('No employee records found in the file.');
          return;
        }

        setXlsxRows(employees);
        setInlinePhones({});
      } catch {
        setXlsxError('Failed to parse the Excel file. Please check the file format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Contacts CRUD ────────────────────────────────────────────
  const addContact = async () => {
    const name    = contactForm.name.trim();
    const phone   = contactForm.phoneNumber.trim();
    const staffNo = contactForm.staffNo.trim();
    if (!name)  { setContactError('Employee name is required.'); return; }
    if (!phone) { setContactError('Phone number is required.'); return; }
    if (!isValidPhone(phone)) {
      setContactError('Enter a valid Kenyan mobile number (e.g. 0712345678 or 254712345678).');
      return;
    }
    if (contacts.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setContactError(`A contact named "${name}" already exists.`);
      return;
    }
    try {
      const { data } = await recipientService.create({ name, phone, staff_no: staffNo || undefined });
      const c = data.contact;
      setContacts(prev => [...prev, { id: c.id, staffNo: c.staff_no || '', name: c.name, phoneNumber: c.phone }]);
      setContactForm({ staffNo: '', name: '', phoneNumber: '' });
      setContactError('');
    } catch (err) {
      setContactError(err.response?.data?.message || 'Failed to save contact. Please try again.');
    }
  };

  const deleteContact = async (id) => {
    const prev = contacts;
    setContacts(prev.filter(c => c.id !== id));
    try {
      await recipientService.delete(id);
    } catch (err) {
      console.error('Failed to delete contact:', err);
      setContacts(prev);
    }
  };

  // ── Submit handlers ──────────────────────────────────────────
  const resolvedRows = xlsxRows.map(r => ({
    ...r,
    resolvedPhone: inlinePhones[r._id] !== undefined ? inlinePhones[r._id] : r.phone,
  }));
  const missingPhones = resolvedRows.filter(r => !r.resolvedPhone.trim()).length;
  const payrollReady  = payrollName.trim() && xlsxRows.length > 0 && missingPhones === 0;

  const submitPayroll = async () => {
    if (!payrollReady || requesting) return;
    const payloads = resolvedRows.map(row => ({
      phoneNumber: normalizePhone(row.resolvedPhone),
      amount:      row.netPay,
      remarks:     `${payrollName.trim()} - ${row.name}`,
    }));
    const totalAmount = xlsxRows.reduce((s, r) => s + r.netPay, 0);
    const label = payrollName.trim();
    setRequesting(true);
    try {
      const { data } = await payoutService.request({
        type: 'payroll', payload: { rows: resolvedRows, payloads }, label, amount: totalAmount,
        initiatedBy: user.name,
      });
      openModal('payroll', label, totalAmount, { rows: resolvedRows, payloads }, data.payoutId);
    } catch {
      alert('Failed to initiate payout. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const submitSingle = async () => {
    if (!single.contact.trim() || !single.amount || requesting) return;
    setRequesting(true);
    const draftId = await claimLoadedDraft('single');
    if (draftId === false) { setRequesting(false); return; }
    const label = `Payment to ${single.contact}`;
    const amount = parseFloat(single.amount) || 0;
    const payload = {
      phoneNumber: normalizePhone(single.contact),
      amount,
      remarks:     single.description || 'Payment',
      description: single.description,
    };
    try {
      const { data } = await payoutService.request({ type: 'single', payload, label, amount, initiatedBy: user.name });
      openModal('single', label, amount, { ...single }, data.payoutId, draftId);
    } catch {
      releaseDraft(draftId);
      alert('Failed to initiate payout. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const submitB2B = async () => {
    if (!b2bReady || requesting) return;
    const label = b2bType === 'paybill'
      ? `Paybill ${b2b.paybillNumber} — Acc: ${b2b.accountNumber}`
      : `Till ${b2b.tillNumber}`;
    const amount = parseFloat(b2b.amount) || 0;
    setRequesting(true);
    try {
      const { data } = await payoutService.request({
        type: 'b2b', payload: { b2bType, ...b2b }, label, amount,
        initiatedBy: user.name,
      });
      openModal('b2b', label, amount, { b2bType, ...b2b }, data.payoutId);
    } catch {
      alert('Failed to initiate payout. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const b2bReady = b2bType === 'paybill'
    ? b2b.paybillNumber && b2b.accountNumber && b2b.amount
    : b2b.tillNumber && b2b.amount;

  // ── Transaction Payout handlers ──────────────────────────────
  const submitTxnPayout = async () => {
    const { projectId, contact, amount, description } = txnPayout;
    if (!projectId || !contact.trim() || !amount || txnRequesting) return;
    const selectedProject = projects.find(p => p.id === projectId) || null;
    const label  = `Payment to ${contact}`;
    const amt    = parseFloat(amount) || 0;
    const payload = {
      phoneNumber:    normalizePhone(contact),
      amount:         amt,
      remarks:        description || 'Transaction Payout',
      description,
      // stored server-side so the transaction can be recovered if the browser closes
      imprestId:      null,
      projectId:      selectedProject?.id   || null,
      userId:         user.id,
      imprestName:    null,
      imprestProject: selectedProject?.name || null,
    };
    setTxnRequesting(true);
    const draftId = await claimLoadedDraft('txn_payout');
    if (draftId === false) { setTxnRequesting(false); return; }
    try {
      const { data } = await payoutService.request({ type: 'txn_payout', payload, label, amount: amt, initiatedBy: user.name });
      setModalStep('pin');
      openModal('txn_payout', label, amt, {
        ...txnPayout,
        project: selectedProject,
        imprest: null,
      }, data.payoutId, draftId);
    } catch {
      releaseDraft(draftId);
      alert('Failed to initiate payout. Please try again.');
    } finally {
      setTxnRequesting(false);
    }
  };

  const handleSaveTxnRecord = async () => {
    if (txnSaving) return;
    const { item } = txnForm;
    const imprest = modal?.payload?.imprest;
    const payoutAmt = modal?.amount || 0;
    const vat = txnForm.vatEnabled ? parseFloat((payoutAmt * VAT_RATE).toFixed(2)) : 0;
    const total = parseFloat((payoutAmt + vat).toFixed(2));

    if (!item.trim()) {
      setTxnFormError('Please enter a description.');
      return;
    }

    setTxnSaving(true);
    setTxnFormError('');

    // 1. Upload receipt (optional)
    let imageFilename = null;
    if (txnImageFile) {
      try {
        const fd = new FormData();
        fd.append('file', txnImageFile);
        const { data } = await imageService.upload(fd);
        imageFilename = data.file;
      } catch {
        setTxnFormError('Receipt upload failed. Please try again.');
        setTxnSaving(false);
        return;
      }
    }

    // 2. Create transaction
    const txnData = {
      imprestAccount_id: imprest.id,
      item:              item.trim(),
      itemQuantity:      1,
      unitPrice:         payoutAmt,
      Total_amount:      total,
      userID:            user.id,
      vat_charged:       vat,
      url_image:         imageFilename,
      mpesa_code:            modal?.payload?.mpesaCode || null,
      mpesa_recipient_phone: modal?.payload?.mpesaPhone || null,
      mpesa_recipient_name:  modal?.payload?.mpesaRecipientName || null,
    };

    try {
      const { data: createdTxn } = await transactionService.create(txnData);
      // Best-effort — don't block UI on failure. Link first so that if markTxnRecorded
      // itself fails, a later retry can attach a receipt instead of creating a duplicate.
      if (ocid) {
        payoutService.setFinanceTransaction(ocid, createdTxn.transaction.id).catch(() => {});
        payoutService.markTxnRecorded(ocid).catch(() => {});
        setServerFailedTxns(prev => prev.filter(e => e.originatorConversationId !== ocid));
      }
      setModal(null);
      setModalStep('pin');
      setTxnPayout({ projectId: '', contact: '', amount: '', description: '' });
      setProjectSearch('');
      setTxnForm({ item: '', vatEnabled: false });
      setTxnImageFile(null);
      setOcid(null);
      setTxnSuccess('Payout completed and transaction recorded successfully.');
      setTimeout(() => setTxnSuccess(''), 6000);
      fetchLedger();
    } catch {
      const entry = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        payoutLabel: modal.label,
        payoutAmount: payoutAmt,
        imprestName: imprest.name,
        imprestProject: imprest.projectName || null,
        transactionData: txnData,
      };
      setFailedTxns(prev => [entry, ...prev]);
      setModal(null);
      setModalStep('pin');
      alert('Payout succeeded but transaction recording failed. Check "Action Required" in the ledger to retry.');
      fetchLedger();
    } finally {
      setTxnSaving(false);
    }
  };

  const retryFailedTxn = async () => {
    if (retrying || !retryEntry) return;

    const { item, quantity, unitPrice } = retryForm;
    const { vat, total } = getTxnTotals(retryForm);

    if (!item.trim() || !quantity || !unitPrice) {
      setRetryError('Please fill in all required fields.');
      return;
    }

    // Need image if not already uploaded
    const existingUrl = retryEntry.transactionData.url_image;
    if (!existingUrl && !retryImageFile) {
      setRetryError('Please attach a receipt image.');
      return;
    }

    setRetrying(true);
    setRetryError('');

    // Transaction was already created (we just failed to confirm that server-side, or the
    // receipt was never attached) — update it and attach the receipt, don't create a duplicate.
    if (retryEntry.financeTransactionId) {
      try {
        await transactionService.update(retryEntry.financeTransactionId, {
          item:        item.trim(),
          quantity:    parseFloat(quantity),
          unitPrice:   parseFloat(unitPrice),
          vat_charged: vat,
          price:       total,
          ...(retryEntry.mpesaCode ? { mpesa_code: retryEntry.mpesaCode } : {}),
          ...(retryEntry.mpesaPhone ? { mpesa_recipient_phone: retryEntry.mpesaPhone } : {}),
          ...(retryEntry.mpesaRecipientName ? { mpesa_recipient_name: retryEntry.mpesaRecipientName } : {}),
        });
        if (retryImageFile) {
          const fd = new FormData();
          fd.append('file', retryImageFile);
          await transactionService.uploadReceipt(retryEntry.financeTransactionId, fd);
        }
        if (retryEntry.originatorConversationId) {
          payoutService.markTxnRecorded(retryEntry.originatorConversationId).catch(() => {});
        }
        setServerFailedTxns(prev => prev.filter(e => e.id !== retryEntry.id));
        setRetryEntry(null);
        setRetryImageFile(null);
        setTxnSuccess('Transaction recorded successfully.');
        setTimeout(() => setTxnSuccess(''), 6000);
      } catch {
        setRetryError('Transaction recording failed. Please try again.');
      } finally {
        setRetrying(false);
      }
      return;
    }

    let imageFilename = existingUrl || null;

    if (!imageFilename) {
      try {
        const fd = new FormData();
        fd.append('file', retryImageFile);
        const { data } = await imageService.upload(fd);
        imageFilename = data.file;
      } catch {
        setRetryError('Receipt upload failed. Please try again.');
        setRetrying(false);
        return;
      }
    }

    let imprestAccountId = retryEntry.transactionData.imprestAccount_id;

    // Payout was made against a project rather than a specific imprest —
    // resolve (or create) its Expenses imprest, same as the live record flow.
    if (!imprestAccountId && retryEntry.transactionData.projectId) {
      try {
        const { data } = await imprestService.findOrCreateExpenses({
          project_id: retryEntry.transactionData.projectId,
          amount:     retryEntry.payoutAmount,
          createdBy:  retryEntry.transactionData.userID,
        });
        imprestAccountId = data.imprest.id;
      } catch {
        setRetryError('Could not resolve the project expense account. Please try again.');
        setRetrying(false);
        return;
      }
    }

    if (!imprestAccountId) {
      setRetryError('No imprest or project associated with this payout — cannot record.');
      setRetrying(false);
      return;
    }

    let txnData = {
      imprestAccount_id: imprestAccountId,
      item:              item.trim(),
      itemQuantity:      parseFloat(quantity),
      unitPrice:         parseFloat(unitPrice),
      Total_amount:      total,
      userID:            retryEntry.transactionData.userID,
      vat_charged:       vat,
      url_image:         imageFilename,
      mpesa_code:            retryEntry.mpesaCode || retryEntry.transactionData.mpesa_code || null,
      mpesa_recipient_phone: retryEntry.mpesaPhone || retryEntry.transactionData.mpesa_recipient_phone || null,
      mpesa_recipient_name:  retryEntry.mpesaRecipientName || retryEntry.transactionData.mpesa_recipient_name || null,
    };

    try {
      await transactionService.create(txnData);
      if (retryEntry.isServerEntry && retryEntry.originatorConversationId) {
        payoutService.markTxnRecorded(retryEntry.originatorConversationId).catch(() => {});
        setServerFailedTxns(prev => prev.filter(e => e.id !== retryEntry.id));
      } else {
        setFailedTxns(prev => prev.filter(f => f.id !== retryEntry.id));
      }
      setRetryEntry(null);
      setRetryImageFile(null);
      setTxnSuccess('Transaction recorded successfully.');
      setTimeout(() => setTxnSuccess(''), 6000);
    } catch {
      setRetryError('Transaction recording failed. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  const txnPayoutReady = txnPayout.projectId && txnPayout.contact.trim() && txnPayout.amount;

  // ── Batch payout handlers ────────────────────────────────────
  const addBatchItem = () => {
    const { projectId, projectName, amount, description } = batchForm;
    if (!projectId) { setBatchItemError('Select a project.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setBatchItemError('Enter a valid amount.'); return; }
    if (!description.trim()) { setBatchItemError('Enter a description.'); return; }
    setBatchItems(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      projectId, projectName, imprestId: null, imprestName: null,
      amount: parseFloat(amount),
      description: description.trim(),
    }]);
    setBatchForm({ projectId: '', projectName: '', amount: '', description: '' });
    setBatchProjectSearch('');
    setBatchItemError('');
  };

  const submitBatchPayout = async () => {
    if (batchItems.length === 0) { setBatchSubmitError('Add at least one item.'); return; }
    if (batchItems.some(i => i._issue)) { setBatchSubmitError('Remove the flagged items before paying.'); return; }
    if (!batchPhone.trim()) { setBatchSubmitError('Enter a phone number.'); return; }
    if (!isValidPhone(batchPhone)) { setBatchSubmitError('Enter a valid Kenyan mobile number.'); return; }
    if (batchRequesting) return;
    const total = batchItems.reduce((s, i) => s + i.amount, 0);
    const label = `Batch payout to ${batchPhone} (${batchItems.length} items)`;
    const payload = { phoneNumber: normalizePhone(batchPhone), amount: total, remarks: `Batch payout — ${batchItems.length} items` };
    setBatchRequesting(true);
    setBatchSubmitError('');
    const draftId = await claimLoadedDraft('batch_payout');
    if (draftId === false) { setBatchRequesting(false); return; }
    try {
      const { data } = await payoutService.request({ type: 'batch_payout', payload, label, amount: total, initiatedBy: user.name });
      setModalStep('pin');
      openModal('batch_payout', label, total, { batchItems: [...batchItems], contact: batchPhone }, data.payoutId, draftId);
    } catch {
      releaseDraft(draftId);
      setBatchSubmitError('Failed to initiate payout. Please try again.');
    } finally {
      setBatchRequesting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      <div className="po-page">

        {/* ── Row 1: Hero cards ─────────────────────────────── */}
        <div className="po-hero-row">
          <div className="po-hero-card primary">
            <div className="po-hero-pill">● AVAILABLE TO DISBURSE</div>
            <div className="po-hero-amount">
              {balance.utilityAccountFunds !== null ? fmtCur(balance.utilityAccountFunds) : 'KES —'}
            </div>
            <div className="po-hero-sub">Source: <span className="po-hero-src">M-Pesa Business Account</span></div>
            <div className="po-hero-indicators">
              <span className="po-ind"><span className="po-ind-dot green"></span>System operational</span>
              <span className="po-ind"><span className="po-ind-dot blue"></span>Daraja API connected</span>
            </div>
            {balance.asOf && (
              <div className="po-hero-as-of">As of {fmtDate(balance.asOf)}</div>
            )}
          </div>

          <div className="po-hero-card secondary">
            <div className="po-hero-pill muted">WORKING ACCOUNT BALANCE</div>
            <div className="po-hero-amount dim">
              {balance.workingAccountFunds !== null ? fmtCur(balance.workingAccountFunds) : 'KES —'}
            </div>
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

            {/* ── History ─────────────────────────────────── */}
            {txnSuccess && (
              <div className="po-success-banner">
                <span>✓</span> {txnSuccess}
              </div>
            )}
            {savedNotice && (
              <div className={savedNotice.kind === 'warn' ? 'po-warn-banner' : 'po-success-banner'}>
                <span>{savedNotice.kind === 'warn' ? '⚠' : '✓'}</span> {savedNotice.text}
                {savedNotice.kind === 'warn' && (
                  <button className="po-link-btn" style={{ marginLeft: 8 }} onClick={() => setSavedNotice(null)}>Dismiss</button>
                )}
              </div>
            )}

            {/* ── Saved payouts ───────────────────────────── */}
            {view === 'saved' && (
              <SavedPayouts
                drafts={savedPayouts}
                loading={savedLoading}
                userId={user.id}
                canDiscard={canDeleteSavedPayouts()}
                busyId={savedBusyId}
                onLoad={handleLoadDraft}
                onRename={handleRenameDraft}
                onDiscard={handleDiscardDraft}
              />
            )}

            {view === 'history' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Transaction Ledger</h2>
                    <p>Real-time payout activity</p>
                  </div>
                </div>

                {/* ── Action Required ───────────────────────── */}
                {(serverFailedTxns.length > 0 || failedTxns.length > 0) && (() => {
                  const allFailed = [...serverFailedTxns, ...failedTxns];
                  return (
                  <div className="po-action-required">
                    <div className="po-ar-header">
                      <span className="po-ar-icon">⚠</span>
                      <strong>Action Required</strong>
                      <span className="po-ar-count">{allFailed.length} unrecorded transaction{allFailed.length > 1 ? 's' : ''}</span>
                    </div>
                    {allFailed.map(entry => (
                      <div key={entry.id} className="po-ar-item">
                        <div className="po-ar-info">
                          <div className="po-ar-label">{entry.payoutLabel}</div>
                          <div className="po-ar-meta">
                            {entry.imprestName}{entry.imprestProject ? ` · ${entry.imprestProject}` : ''} · {fmtDate(entry.createdAt)}
                          </div>
                        </div>
                        <div className="po-ar-amount">{fmtCur(entry.payoutAmount)}</div>
                        <button
                          className="po-ar-retry-btn"
                          onClick={() => openRetry(entry)}
                        >
                          Retry
                        </button>
                      </div>
                    ))}
                  </div>
                  );
                })()}

                {history.length === 0 ? (
                  <div className="po-empty">
                    <span className="po-empty-icon">📭</span>
                    <p>No payout history yet. Initiate a payment using the menu on the right.</p>
                  </div>
                ) : (() => {
                  const totalPages  = Math.ceil(history.length / historyPageSize);
                  const safePage    = Math.min(historyPage, totalPages);
                  const start       = (safePage - 1) * historyPageSize;
                  const pageEntries = history.slice(start, start + historyPageSize);
                  return (
                    <>
                      <div className="po-ledger-toolbar">
                        <span className="po-ledger-count">
                          Showing {start + 1}–{Math.min(start + historyPageSize, history.length)} of {history.length}
                        </span>
                        <div className="po-ledger-page-size">
                          <span>Rows per page:</span>
                          {[20, 50, 100, 200].map(n => (
                            <button
                              key={n}
                              className={`po-page-size-btn${historyPageSize === n ? ' active' : ''}`}
                              onClick={() => { setHistoryPageSize(n); setHistoryPage(1); }}
                            >{n}</button>
                          ))}
                        </div>
                      </div>

                      <div className="po-table-wrap">
                        <table className="po-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Description</th>
                              <th>Amount</th>
                              <th>Transacted by</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageEntries.map(entry => {
                              const isBatch = Array.isArray(entry.payload?.rows);
                              const isBatchPayout = entry.type === 'batch_payout';
                              return (
                              <React.Fragment key={entry.id}>
                                <tr
                                  className={`${isBatch ? '' : 'po-row-clickable'}${isBatchPayout && expanded === entry.id ? ' po-row-expanded' : ''}`}
                                  onClick={() => {
                                    if (isBatchPayout) toggleBatchPayout(entry);
                                    else if (!isBatch) setVoucher(buildVoucher(entry));
                                  }}
                                >
                                  <td className="td-mono">{fmtDate(entry.date)}</td>
                                  <td><span className={`po-type-badge ${entry.type}`}>{TYPE_LABEL[entry.type]}</span></td>
                                  <td className="td-desc">{entry.label}</td>
                                  <td className="td-amount">{entry.amount !== null ? fmtCur(entry.amount) : '—'}</td>
                                  <td className="td-initiated-by">{entry.initiatedBy || '—'}</td>
                                  <td>
                                    <span className="po-status-dot" style={{ background: STATUS_META[entry.status]?.dot }}></span>
                                    <span className={`po-status-txt ${STATUS_META[entry.status]?.cls}`}>
                                      {STATUS_META[entry.status]?.label}
                                    </span>
                                  </td>
                                  <td>
                                    {isBatch || isBatchPayout ? (
                                      <button
                                        className="po-expand-btn"
                                        title={isBatchPayout ? 'Show the items in this batch' : undefined}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isBatchPayout) toggleBatchPayout(entry);
                                          else setExpanded(expanded === entry.id ? null : entry.id);
                                        }}
                                      >
                                        {expanded === entry.id ? '▲' : '▼'}
                                      </button>
                                    ) : (
                                      <button
                                        className="po-voucher-btn"
                                        title="View payment voucher"
                                        onClick={(e) => { e.stopPropagation(); setVoucher(buildVoucher(entry)); }}
                                      >
                                        🧾
                                      </button>
                                    )}
                                  </td>
                                </tr>

                                {isBatchPayout && expanded === entry.id && (
                                  <tr className="po-sub-row">
                                    <td colSpan={7}>
                                      <div className="po-sub-wrap">{renderBatchPayoutItems(entry)}</div>
                                    </td>
                                  </tr>
                                )}

                                {isBatch && expanded === entry.id && (
                                  <tr className="po-sub-row">
                                    <td colSpan={7}>
                                      <div className="po-sub-wrap">
                                        <table className="po-table po-sub-table">
                                          <thead>
                                            <tr>
                                              <th>Staff No</th>
                                              <th>Employee Name</th>
                                              <th>Net Pay</th>
                                              <th>Phone</th>
                                              <th>Status</th>
                                              <th></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {entry.payload.rows.map(row => (
                                              <tr
                                                key={row._id}
                                                className="po-row-clickable"
                                                onClick={() => setVoucher(buildPayrollRowVoucher(entry, row))}
                                              >
                                                <td>{row.staffNo || '—'}</td>
                                                <td>{row.name}</td>
                                                <td>{fmtCur(row.netPay)}</td>
                                                <td className="td-mono">{row.resolvedPhone}</td>
                                                <td>
                                                  <span className="po-status-dot" style={{ background: STATUS_META[entry.status]?.dot }}></span>
                                                  <span className={`po-status-txt ${STATUS_META[entry.status]?.cls}`}>
                                                    {STATUS_META[entry.status]?.label}
                                                  </span>
                                                </td>
                                                <td>
                                                  <button
                                                    className="po-voucher-btn"
                                                    title="View payment voucher"
                                                    onClick={(e) => { e.stopPropagation(); setVoucher(buildPayrollRowVoucher(entry, row)); }}
                                                  >
                                                    🧾
                                                  </button>
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
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {totalPages > 1 && (
                        <div className="po-pagination">
                          <button
                            className="po-page-btn"
                            onClick={() => setHistoryPage(1)}
                            disabled={safePage === 1}
                          >«</button>
                          <button
                            className="po-page-btn"
                            onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                          >‹ Prev</button>
                          <span className="po-page-indicator">Page {safePage} of {totalPages}</span>
                          <button
                            className="po-page-btn"
                            onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                          >Next ›</button>
                          <button
                            className="po-page-btn"
                            onClick={() => setHistoryPage(totalPages)}
                            disabled={safePage === totalPages}
                          >»</button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {/* ── Payroll import ───────────────────────────── */}
            {view === 'payroll' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Payroll Import</h2>
                    <p>Upload the muster roll (.xlsx), review, then initiate. Director PIN required to disburse.</p>
                  </div>
                </div>
                <div className="po-form">
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> per employee (Safaricom B2C limit)</p>
                  <div className="po-field">
                    <label>Payroll Period / Name</label>
                    <input
                      type="text"
                      value={payrollName}
                      onChange={e => setPayrollName(e.target.value)}
                      placeholder="e.g. February 2026 Payroll"
                    />
                  </div>

                  <div className="po-field">
                    <label>Upload Muster Roll</label>
                    <label htmlFor="xlsx-upload" className={`po-drop-zone ${xlsxRows.length > 0 ? 'loaded' : ''}`}>
                      <span className="po-drop-icon">{xlsxRows.length > 0 ? '✅' : '📊'}</span>
                      <span className="po-drop-main">
                        {xlsxRows.length > 0 ? `${xlsxRows.length} employees loaded` : 'Click to upload Excel file'}
                      </span>
                      <span className="po-drop-hint">
                        {xlsxRows.length > 0 ? 'Click to replace file' : 'Excel spreadsheet (.xlsx / .xls)'}
                      </span>
                      <input id="xlsx-upload" type="file" accept=".xlsx,.xls" onChange={handleXLSX} />
                    </label>
                    {xlsxError && <p className="po-field-error">{xlsxError}</p>}
                  </div>

                  {xlsxRows.length > 0 && (
                    <>
                      <div className="po-csv-meta">
                        <span>{xlsxRows.length} employees</span>
                        <span>Total Net Pay: <strong>{fmtCur(xlsxRows.reduce((s, r) => s + r.netPay, 0))}</strong></span>
                        {missingPhones > 0 && (
                          <span className="po-meta-warn">
                            ⚠ {missingPhones} missing phone{missingPhones > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className="po-table-wrap">
                        <table className="po-table">
                          <thead>
                            <tr>
                              <th>Staff No</th>
                              <th>Employee Name</th>
                              <th>Net Pay</th>
                              <th>Phone Number</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resolvedRows.map(row => (
                              <tr key={row._id}>
                                <td className="td-mono">{row.staffNo || '—'}</td>
                                <td>{row.name}</td>
                                <td className="td-amount">{fmtCur(row.netPay)}</td>
                                <td>
                                  <input
                                    className={`po-inline-phone ${row.resolvedPhone && !isValidPhone(row.resolvedPhone) ? 'invalid' : ''}`}
                                    type="text"
                                    value={row.resolvedPhone}
                                    onChange={e => setInlinePhones(p => ({ ...p, [row._id]: e.target.value }))}
                                    placeholder="e.g. 0712345678"
                                  />
                                </td>
                                <td>
                                  {row.resolvedPhone.trim()
                                    ? <span className="po-contact-badge matched">Matched</span>
                                    : <span className="po-contact-badge missing">No phone</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {missingPhones > 0 && (
                        <p className="po-phone-hint">
                          Fill in phone numbers above, or save them to{' '}
                          <button className="po-link-btn" onClick={() => setView('contacts')}>
                            Contacts
                          </button>{' '}
                          for auto-fill next time.
                        </p>
                      )}
                    </>
                  )}

                  <div className="po-form-footer">
                    <button className="po-initiate-btn" onClick={submitPayroll} disabled={!payrollReady || requesting}>
                      {requesting ? 'Sending SMS…' : 'Initiate Payroll Payment'}
                    </button>
                    {!payrollName.trim() && xlsxRows.length > 0 && (
                      <span className="po-hint">Enter a payroll name to continue</span>
                    )}
                    {missingPhones > 0 && payrollName.trim() && (
                      <span className="po-hint">Fill in all phone numbers to continue</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Single Payment ───────────────────────────── */}
            {view === 'single' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Single Payment</h2>
                    <p>Send a one-off payment to an individual contact. Director PIN required.</p>
                  </div>
                </div>
                <div className="po-form narrow">
                  {loadedDraft?.draft.type === 'single' && (
                    <LoadedDraftBanner draft={loadedDraft.draft} warnings={loadedDraft.warnings} error={draftError} onDetach={detachDraft} />
                  )}
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>
                  <div className="po-field">
                    <label>Contact / Phone Number</label>
                    <RecipientPicker
                      value={single.contact}
                      onChange={v => setSingle(p => ({ ...p, contact: v }))}
                      recipients={contacts.map(c => ({ id: c.id, name: c.name, phone: c.phoneNumber }))}
                    />
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
                      disabled={!single.contact.trim() || !single.amount || requesting}>
                      {requesting ? 'Sending SMS…' : 'Initiate Payment'}
                    </button>
                    <button className="po-save-draft-btn" onClick={() => openSaveDialog('single')}
                      disabled={!single.contact.trim() || !(parseFloat(single.amount) > 0) || requesting}>
                      {loadedDraft?.draft.type === 'single' ? 'Update saved payout' : 'Save for later'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── B2B Payment ──────────────────────────────── */}
            {view === 'b2b' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>B2B Payment</h2>
                    <p>Pay directly to a paybill or till number. Director PIN required.</p>
                  </div>
                </div>
                <div className="po-form narrow">
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>
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
                    <button className="po-initiate-btn" onClick={submitB2B} disabled={!b2bReady || requesting}>
                      {requesting ? 'Sending SMS…' : 'Initiate B2B Payment'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Transaction Payout ──────────────────────── */}
            {view === 'txn_payout' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Transaction Payout</h2>
                    <p>Send a payment and record it in a project's Expenses account. Director PIN required.</p>
                  </div>
                </div>

                <div className="po-mode-toggle">
                  <button className={`po-mode-btn${txnMode === 'single' ? ' active' : ''}`} onClick={() => setTxnMode('single')}>Single</button>
                  <button className={`po-mode-btn${txnMode === 'batch' ? ' active' : ''}`} onClick={() => setTxnMode('batch')}>Batch</button>
                </div>

                {txnMode === 'single' && <div className="po-form narrow">
                  {loadedDraft?.draft.type === 'txn_payout' && (
                    <LoadedDraftBanner draft={loadedDraft.draft} warnings={loadedDraft.warnings} error={draftError} onDetach={detachDraft} />
                  )}
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>

                  {/* Step 1 — Select Project */}
                  <div className="po-txp-section-label">Step 1 — Select Project <span className="po-txp-required">*</span></div>
                  <div className="po-field" ref={projectRef} style={{ position: 'relative' }}>
                    <label>Project</label>
                    {projectsLoading ? (
                      <div className="po-txp-loading">Loading projects…</div>
                    ) : (
                      <>
                        <input
                          type="text"
                          className="po-txp-search"
                          placeholder="Search project…"
                          value={projectSearch}
                          onFocus={() => setProjectOpen(true)}
                          onChange={e => {
                            setProjectSearch(e.target.value);
                            setProjectOpen(true);
                            if (txnPayout.projectId) setTxnPayout(p => ({ ...p, projectId: '' }));
                          }}
                        />
                        {projectOpen && (
                          <div className="po-txp-dropdown">
                            {projects
                              .filter(proj => proj.name.toLowerCase().includes(projectSearch.toLowerCase()))
                              .map(proj => (
                                <div
                                  key={proj.id}
                                  className={`po-txp-option${txnPayout.projectId === proj.id ? ' selected' : ''}`}
                                  onMouseDown={() => {
                                    setTxnPayout(p => ({ ...p, projectId: proj.id }));
                                    setProjectSearch(proj.name);
                                    setProjectOpen(false);
                                  }}
                                >
                                  <div className="po-txp-opt-name">{proj.name}</div>
                                  <div className="po-txp-opt-bal">{proj.status}</div>
                                </div>
                              ))
                            }
                            {projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                              <div className="po-txp-no-results">No projects match your search</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {txnPayout.projectId && (
                      <p className="po-txp-hint">The expense will be recorded in this project's Expenses account.</p>
                    )}
                  </div>

                  {/* Step 2 — Payment details */}
                  <div className="po-txp-section-label">Step 2 — Payment Details</div>
                  <div className="po-field">
                    <label>Recipient Phone Number</label>
                    <RecipientPicker
                      value={txnPayout.contact}
                      onChange={v => setTxnPayout(p => ({ ...p, contact: v }))}
                      recipients={contacts.map(c => ({ id: c.id, name: c.name, phone: c.phoneNumber }))}
                    />
                  </div>
                  <div className="po-field">
                    <label>Amount (KES)</label>
                    <input
                      type="number"
                      value={txnPayout.amount}
                      onChange={e => setTxnPayout(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00" min="0" step="0.01"
                    />
                  </div>
                  <div className="po-field">
                    <label>Description / Reason</label>
                    <textarea
                      value={txnPayout.description}
                      onChange={e => setTxnPayout(p => ({ ...p, description: e.target.value }))}
                      placeholder="e.g. Payment for plumbing services — Site B, Block 3"
                      rows={4}
                    />
                  </div>

                  {txnPayout.contact && txnPayout.amount && txnPayout.projectId && (
                    <div className="po-preview">
                      Sending <strong>{fmtCur(txnPayout.amount)}</strong> to <strong>{txnPayout.contact}</strong>
                      {' '}— recorded in <strong>{projects.find(p => p.id === txnPayout.projectId)?.name} / Expenses</strong>
                    </div>
                  )}

                  <div className="po-form-footer">
                    <button
                      className="po-initiate-btn"
                      onClick={submitTxnPayout}
                      disabled={!txnPayoutReady || txnRequesting}
                    >
                      {txnRequesting ? 'Sending SMS…' : 'Initiate Transaction Payout'}
                    </button>
                    <button className="po-save-draft-btn" onClick={() => openSaveDialog('txn_payout')}
                      disabled={!txnPayoutReady || !(parseFloat(txnPayout.amount) > 0) || txnRequesting}>
                      {loadedDraft?.draft.type === 'txn_payout' ? 'Update saved payout' : 'Save for later'}
                    </button>
                    {!txnPayout.projectId && (
                      <span className="po-hint">Select a project to continue</span>
                    )}
                  </div>
                </div>}

                {/* ── Batch mode ──────────────────────────────── */}
                {txnMode === 'batch' && loadedDraft?.draft.type === 'batch_payout' && (
                  <div className="po-batch-draft-banner">
                    <LoadedDraftBanner draft={loadedDraft.draft} warnings={loadedDraft.warnings} error={draftError} onDetach={detachDraft} />
                  </div>
                )}

                {txnMode === 'batch' && (
                  <div className="po-batch-layout">

                    {/* Left: add-item form */}
                    <div className="po-batch-form-col">
                      <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>

                      <div className="po-txp-section-label">Project <span className="po-txp-required">*</span></div>
                      <div className="po-field" ref={batchProjectRef} style={{ position: 'relative' }}>
                        {projectsLoading ? (
                          <div className="po-txp-loading">Loading projects…</div>
                        ) : (
                          <>
                            <input
                              type="text"
                              className="po-txp-search"
                              placeholder="Search project…"
                              value={batchProjectSearch}
                              onFocus={() => setBatchProjectOpen(true)}
                              onChange={e => {
                                setBatchProjectSearch(e.target.value);
                                setBatchProjectOpen(true);
                                setBatchForm(p => ({ ...p, projectId: '', projectName: '' }));
                              }}
                            />
                            {batchProjectOpen && (
                              <div className="po-txp-dropdown">
                                {projects
                                  .filter(proj => proj.name.toLowerCase().includes(batchProjectSearch.toLowerCase()))
                                  .map(proj => (
                                    <div
                                      key={proj.id}
                                      className={`po-txp-option${batchForm.projectId === proj.id ? ' selected' : ''}`}
                                      onMouseDown={() => {
                                        setBatchForm(p => ({ ...p, projectId: proj.id, projectName: proj.name }));
                                        setBatchProjectSearch(proj.name);
                                        setBatchProjectOpen(false);
                                      }}
                                    >
                                      <div className="po-txp-opt-name">{proj.name}</div>
                                      <div className="po-txp-opt-bal">{proj.status}</div>
                                    </div>
                                  ))
                                }
                                {projects.filter(p => p.name.toLowerCase().includes(batchProjectSearch.toLowerCase())).length === 0 && (
                                  <div className="po-txp-no-results">No projects match</div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="po-field">
                        <label>Amount (KES)</label>
                        <input
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={batchForm.amount}
                          onChange={e => setBatchForm(p => ({ ...p, amount: e.target.value }))}
                        />
                      </div>

                      <div className="po-field">
                        <label>Description</label>
                        <textarea
                          rows={3} placeholder="e.g. Labour costs — Block 3"
                          value={batchForm.description}
                          onChange={e => setBatchForm(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>

                      {batchItemError && <p className="po-field-error">{batchItemError}</p>}

                      <button className="po-batch-add-btn" onClick={addBatchItem}>
                        + Add Item
                      </button>
                    </div>

                    {/* Right: items table + initiate */}
                    <div className="po-batch-table-col">
                      {batchItems.length === 0 ? (
                        <div className="po-batch-empty">
                          <span>Items you add will appear here</span>
                        </div>
                      ) : (
                        <div className="po-table-wrap">
                          <table className="po-batch-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Project</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchItems.map((item, idx) => (
                                <tr key={item.id} className={item._issue ? 'po-batch-row-issue' : ''} title={item._issue || undefined}>
                                  <td className="td-mono">{item._issue ? '⚠' : idx + 1}</td>
                                  <td>{item.projectName || '—'}</td>
                                  <td className="td-desc">{item.description}{item._issue && <div className="po-batch-issue">{item._issue}</div>}</td>
                                  <td className="td-amount">{fmtCur(item.amount)}</td>
                                  <td>
                                    <button
                                      className="po-batch-remove-btn"
                                      onClick={() => setBatchItems(prev => prev.filter(i => i.id !== item.id))}
                                      title="Remove"
                                    >✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="po-batch-total-row">
                                <td colSpan={3}><strong>Total</strong></td>
                                <td className="td-amount"><strong>{fmtCur(batchItems.reduce((s, i) => s + i.amount, 0))}</strong></td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      <div className="po-batch-phone-section">
                        <div className="po-field">
                          <label>Recipient Phone Number</label>
                          <RecipientPicker
                            value={batchPhone}
                            onChange={v => { setBatchPhone(v); setBatchSubmitError(''); }}
                            recipients={contacts.map(c => ({ id: c.id, name: c.name, phone: c.phoneNumber }))}
                          />
                        </div>
                        {batchItems.length > 0 && batchPhone && (
                          <div className="po-preview">
                            Sending <strong>{fmtCur(batchItems.reduce((s, i) => s + i.amount, 0))}</strong> to <strong>{batchPhone}</strong> — {batchItems.length} item{batchItems.length !== 1 ? 's' : ''} will be recorded
                          </div>
                        )}
                        {batchSubmitError && <p className="po-field-error">{batchSubmitError}</p>}
                        <button
                          className="po-initiate-btn"
                          style={{ width: '100%' }}
                          onClick={submitBatchPayout}
                          disabled={batchRequesting || batchItems.length === 0}
                        >
                          {batchRequesting ? 'Sending SMS…' : `Initiate Batch Payout${batchItems.length > 0 ? ` · ${fmtCur(batchItems.reduce((s, i) => s + i.amount, 0))}` : ''}`}
                        </button>
                        <button
                          className="po-save-draft-btn"
                          style={{ width: '100%', marginTop: 8 }}
                          onClick={() => openSaveDialog('batch_payout')}
                          disabled={batchRequesting || batchItems.length === 0 || batchItems.some(i => i._issue) || !isValidPhone(batchPhone)}
                        >
                          {loadedDraft?.draft.type === 'batch_payout' ? 'Update saved payout' : 'Save for later'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Contacts ─────────────────────────────────── */}
            {view === 'contacts' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Employee Contacts</h2>
                    <p>Saved recipients — pick them from the picker button on payout forms, or auto-fill during payroll import.</p>
                  </div>
                </div>
                <div className="po-form">

                  {/* Add contact form — edit_contacts permission required */}
                  {canEditContacts() ? (
                    <div className="po-contacts-section">
                      <h3 className="po-section-title">Add Contact</h3>
                      <div className="po-contacts-grid">
                        <div className="po-field">
                          <label>Employee Name *</label>
                          <input
                            type="text"
                            value={contactForm.name}
                            onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Joel Thamu Kibuna"
                            onKeyDown={e => e.key === 'Enter' && addContact()}
                          />
                        </div>
                        <div className="po-field">
                          <label>Staff No <span className="po-label-opt">(optional)</span></label>
                          <input
                            type="text"
                            value={contactForm.staffNo}
                            onChange={e => setContactForm(p => ({ ...p, staffNo: e.target.value }))}
                            placeholder="e.g. 13"
                            onKeyDown={e => e.key === 'Enter' && addContact()}
                          />
                        </div>
                        <div className="po-field">
                          <label>Phone Number *</label>
                          <input
                            type="text"
                            value={contactForm.phoneNumber}
                            onChange={e => setContactForm(p => ({ ...p, phoneNumber: e.target.value }))}
                            placeholder="e.g. 0712345678"
                            onKeyDown={e => e.key === 'Enter' && addContact()}
                          />
                        </div>
                      </div>
                      {contactError && <p className="po-field-error">{contactError}</p>}
                      <button className="po-add-contact-btn" onClick={addContact}>
                        + Add Contact
                      </button>
                    </div>
                  ) : (
                    <p className="po-hint">You don't have permission to edit contacts. Contact your administrator for edit access.</p>
                  )}

                  {/* Contact list */}
                  {contactsLoading ? (
                    <div className="po-empty"><p>Loading contacts…</p></div>
                  ) : contacts.length > 0 ? (
                    <div className="po-table-wrap">
                      <div className="po-contacts-count">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} saved</div>
                      <table className="po-table">
                        <thead>
                          <tr>
                            <th>Staff No</th>
                            <th>Employee Name</th>
                            <th>Phone Number</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.map(c => (
                            <tr key={c.id}>
                              <td className="td-mono">{c.staffNo || '—'}</td>
                              <td>{c.name}</td>
                              <td className="td-mono">{c.phoneNumber}</td>
                              <td>
                                {canEditContacts() && (
                                  <button
                                    className="po-del-btn"
                                    onClick={() => deleteContact(c.id)}
                                    title="Remove contact"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="po-empty">
                      <span className="po-empty-icon">👥</span>
                      <p>No contacts yet. Add employee phone numbers to speed up payroll processing.</p>
                    </div>
                  )}
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
                {item.key === 'contacts' && contacts.length > 0 && (
                  <span className="po-nav-count">{contacts.length}</span>
                )}
                {item.key === 'saved' && savedPayouts.length > 0 && (
                  <span className="po-nav-count">{savedPayouts.length}</span>
                )}
                {item.key === 'txn_payout' && failedTxns.length > 0 && (
                  <span className="po-nav-count alert">{failedTxns.length}</span>
                )}
                {(item.key === 'single' || item.key === 'payroll' || item.key === 'b2b' || item.key === 'txn_payout' || item.key === 'contacts') && (
                  <span className="po-nav-arrow">›</span>
                )}
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
      {/* No outside-click-to-close: this app is used on field tablets, where an
          accidental screen touch could otherwise drop an in-flight payout. Every
          step has its own explicit Cancel/Close/Save button instead. */}
      {modal && (
        <div className="pin-overlay">
          <div className={`pin-modal${modalStep === 'record' ? ' wide' : ''}`}>
            <div className="pin-modal-head">
              <div className="pin-lock-icon">
                {modalStep === 'record' ? '🧾' : (modalStep === 'polling' || modalStep === 'batch_recording') ? '⏳' : modalStep === 'failed' ? '❌' : pinExpired ? '⏰' : '🔐'}
              </div>
              <h2>
                {modalStep === 'record' ? 'Record Transaction'
                  : modalStep === 'polling' ? 'Processing Payment'
                  : modalStep === 'batch_recording' ? 'Recording Transactions'
                  : modalStep === 'failed' ? 'Payment Failed'
                  : pinExpired ? 'Approval Window Closed'
                  : 'Director Approval Required'}
              </h2>
            </div>
            <div className="pin-modal-body">

              {/* ── Batch recording: auto-recording all line items ── */}
              {modalStep === 'batch_recording' && (
                <>
                  <p className="pin-desc">
                    Payment confirmed. Recording {modal?.payload?.batchItems?.length} transaction{modal?.payload?.batchItems?.length !== 1 ? 's' : ''}…
                  </p>
                  <div className="po-polling-spinner">
                    <div className="po-spinner"></div>
                    <span>Please wait</span>
                  </div>
                </>
              )}

              {/* ── Polling: waiting for Safaricom confirmation ── */}
              {modalStep === 'polling' && (
                <>
                  <p className="pin-desc">
                    PIN authorised. Waiting for Safaricom to confirm the payment…
                  </p>
                  <div className="po-polling-spinner">
                    <div className="po-spinner"></div>
                    <span>Checking payment status</span>
                  </div>
                  <div className="pin-payout-summary" style={{ marginTop: 16 }}>
                    <div className="pin-summary-row">
                      <span className="psr-label">Amount</span>
                      <span className="psr-amount">{fmtCur(modal?.amount)}</span>
                    </div>
                    <div className="pin-summary-row">
                      <span className="psr-label">Recipient</span>
                      <span className="psr-val">{modal?.payload?.contact}</span>
                    </div>
                  </div>
                  {showPollEscape && (
                    <div className="pin-poll-escape" style={{ marginTop: 16 }}>
                      <p className="pin-desc" style={{ marginBottom: 8 }}>
                        This is taking longer than usual. The payment is still being confirmed by Safaricom
                        — closing now won't stop it. You can check its status later under History or
                        Action Required.
                      </p>
                      <button className="pin-cancel-btn" onClick={escapePolling}>
                        Close and check later
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── Failed: payment did not go through ─────── */}
              {modalStep === 'failed' && (
                <div className="pin-expired-body">
                  <p>{pollingError || 'The payment was not completed by Safaricom.'}</p>
                  <p>No transaction has been recorded. Please try again.</p>
                  <button className="pin-cancel-btn" onClick={() => { setModal(null); setModalStep('pin'); setOcid(null); fetchLedger(); }}>
                    Close
                  </button>
                </div>
              )}

              {/* ── Record: simplified transaction form ──────── */}
              {modalStep === 'record' && (
                <>
                  <p className="pin-desc">
                    Payment confirmed by Safaricom. Describe what this payment was for.
                  </p>
                  <div className="po-txn-record-form">

                    {/* Imprest context */}
                    {modal?.payload?.imprest && (
                      <div className="po-txn-context">
                        <span className="po-txn-ctx-label">Recording in</span>
                        <span className="po-txn-ctx-value">
                          {modal.payload.imprest.name}
                          {modal.payload.imprest.projectName ? ` · ${modal.payload.imprest.projectName}` : ''}
                        </span>
                      </div>
                    )}

                    <div className="po-txn-total-row grand" style={{ marginBottom: 12 }}>
                      <span>Payout Amount</span><span>{fmtCur(modal?.amount)}</span>
                    </div>

                    <div className="po-field">
                      <label>Description *</label>
                      <textarea
                        value={txnForm.item}
                        onChange={e => setTxnForm(p => ({ ...p, item: e.target.value }))}
                        placeholder="e.g. Payment for plumbing services — Site B, Block 3"
                        rows={4}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    {/* VAT toggle */}
                    <div className="po-vat-row">
                      <span className="po-vat-label">VAT (16%)</span>
                      <button
                        className={`po-vat-toggle ${txnForm.vatEnabled ? 'on' : 'off'}`}
                        onClick={() => setTxnForm(p => ({ ...p, vatEnabled: !p.vatEnabled }))}
                        type="button"
                      >
                        {txnForm.vatEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {txnForm.vatEnabled && (
                      <div className="po-txn-totals">
                        <div className="po-txn-total-row">
                          <span>Payout</span><span>{fmtCur(modal?.amount)}</span>
                        </div>
                        <div className="po-txn-total-row vat">
                          <span>VAT (16%)</span><span>{fmtCur(parseFloat(((modal?.amount || 0) * VAT_RATE).toFixed(2)))}</span>
                        </div>
                        <div className="po-txn-total-row grand">
                          <span>Total Recorded</span>
                          <span>{fmtCur(parseFloat(((modal?.amount || 0) * (1 + VAT_RATE)).toFixed(2)))}</span>
                        </div>
                      </div>
                    )}

                    {/* Receipt upload (optional) */}
                    <div className="po-field">
                      <label>Receipt Image <span className="po-label-opt">(optional)</span></label>
                      <label className={`po-drop-zone ${txnImageFile ? 'loaded' : ''}`}>
                        <span className="po-drop-icon">{txnImageFile ? '✅' : '🧾'}</span>
                        <span className="po-drop-main">{txnImageFile ? txnImageFile.name : 'Click to attach receipt'}</span>
                        <span className="po-drop-hint">JPG, PNG, PDF accepted</span>
                        <input type="file" accept="image/*,.pdf" onChange={e => setTxnImageFile(e.target.files[0] || null)} />
                      </label>
                    </div>

                    {txnFormError && <p className="pin-error" style={{ textAlign: 'left' }}>{txnFormError}</p>}
                  </div>

                  <div className="pin-modal-actions" style={{ marginTop: 20 }}>
                    <button
                      className="pin-auth-btn"
                      onClick={handleSaveTxnRecord}
                      disabled={txnSaving}
                      style={{ width: '100%' }}
                    >
                      {txnSaving ? 'Saving…' : 'Save Transaction'}
                    </button>
                  </div>
                </>
              )}

              {modalStep === 'pin' && !pinExpired && (
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
                    {modal.type === 'payroll' && modal.payload?.payloads && (
                      <div className="pin-summary-row">
                        <span className="psr-label">Recipients</span>
                        <span className="psr-val">{modal.payload.payloads.length} employees</span>
                      </div>
                    )}
                    {modal.type === 'txn_payout' && modal.payload?.imprest && (
                      <div className="pin-summary-row">
                        <span className="psr-label">Imprest</span>
                        <span className="psr-val">{modal.payload.imprest.name}</span>
                      </div>
                    )}
                  </div>
                  <div className={`pin-timer-bar ${timeLeft <= 60 ? 'urgent' : ''}`}>
                    <span>⏱</span><span>PIN expires in</span>
                    <strong className="pin-clock">{fmtTimer(timeLeft)}</strong>
                  </div>
                  <input
                    type="text" inputMode="numeric" maxLength={5} value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 5)); setPinError(''); }}
                    placeholder="Enter 5-digit PIN" className="pin-input" autoFocus
                  />
                  {pinError && <p className="pin-error">{pinError}</p>}
                  <div className="pin-modal-actions">
                    <button className="pin-cancel-btn" onClick={cancelModal} disabled={submitting}>Cancel</button>
                    <button className="pin-auth-btn" onClick={submitPin} disabled={pin.length !== 5 || submitting}>
                      {submitting ? 'Authorising…' : 'Authorise Payment'}
                    </button>
                  </div>
                </>
              )}
              {modalStep === 'pin' && pinExpired && (
                <div className="pin-expired-body">
                  <p>The 10-minute approval window has closed. This payment has been cancelled.</p>
                  <p>Please initiate a new payment if you still wish to proceed.</p>
                  <button className="pin-cancel-btn" onClick={() => { releaseDraft(modal?.draftId); setModal(null); setPin(''); setModalStep('pin'); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Save for later ──────────────────────────────────── */}
      {saveDialogType && (
        <SaveDraftDialog
          overwriting={loadedDraft?.draft.type === saveDialogType ? loadedDraft.draft : null}
          defaultName={loadedDraft?.draft.type === saveDialogType ? loadedDraft.draft.name : ''}
          userName={user.name}
          saving={savingDraft}
          error={saveDraftError}
          onCancel={() => setSaveDialogType(null)}
          onSave={handleSaveDraft}
        />
      )}

      {/* ── Retry Modal (Action Required) ──────────────────── */}
      {retryEntry && (
        <div className="pin-overlay">
          <div className="pin-modal wide">
            <div className="pin-modal-head">
              <div className="pin-lock-icon">🔄</div>
              <h2>Retry Transaction Recording</h2>
            </div>
            <div className="pin-modal-body">
              {/* Payout context — read only */}
              <div className="pin-payout-summary" style={{ marginBottom: 16 }}>
                <div className="pin-summary-row">
                  <span className="psr-label">Payout</span>
                  <span className="psr-val">{retryEntry.payoutLabel}</span>
                </div>
                <div className="pin-summary-row">
                  <span className="psr-label">Imprest</span>
                  <span className="psr-val">{retryEntry.imprestName}{retryEntry.imprestProject ? ` · ${retryEntry.imprestProject}` : ''}</span>
                </div>
                <div className="pin-summary-row">
                  <span className="psr-label">Payout Amount</span>
                  <span className="psr-amount">{fmtCur(retryEntry.payoutAmount)}</span>
                </div>
              </div>

              {/* Editable transaction details */}
              <div className="po-txn-record-form">
                <div className="po-field">
                  <label>Item / Description *</label>
                  <input
                    type="text"
                    value={retryForm.item}
                    onChange={e => setRetryForm(p => ({ ...p, item: e.target.value }))}
                    placeholder="e.g. Plumbing materials"
                  />
                </div>
                <div className="po-txn-row">
                  <div className="po-field">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      value={retryForm.quantity}
                      onChange={e => setRetryForm(p => ({ ...p, quantity: e.target.value }))}
                      min="1" step="1" placeholder="1"
                    />
                  </div>
                  <div className="po-field">
                    <label>Unit Price (KES) *</label>
                    <input
                      type="number"
                      value={retryForm.unitPrice}
                      onChange={e => setRetryForm(p => ({ ...p, unitPrice: e.target.value }))}
                      min="0" step="0.01" placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="po-vat-row">
                  <span className="po-vat-label">VAT (16%)</span>
                  <button
                    className={`po-vat-toggle ${retryForm.vatEnabled ? 'on' : 'off'}`}
                    onClick={() => setRetryForm(p => ({ ...p, vatEnabled: !p.vatEnabled }))}
                    type="button"
                  >
                    {retryForm.vatEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {(() => {
                  const { subtotal, vat, total } = getTxnTotals(retryForm);
                  const payoutAmt = retryEntry.payoutAmount || 0;
                  const mismatch  = retryForm.quantity && retryForm.unitPrice && total !== payoutAmt;
                  return (
                    <div className="po-txn-totals">
                      <div className="po-txn-total-row">
                        <span>Subtotal</span><span>{fmtCur(subtotal)}</span>
                      </div>
                      {retryForm.vatEnabled && (
                        <div className="po-txn-total-row vat">
                          <span>VAT (16%)</span><span>{fmtCur(vat)}</span>
                        </div>
                      )}
                      <div className={`po-txn-total-row grand${mismatch ? ' mismatch' : ''}`}>
                        <span>Total</span><span>{fmtCur(total)}</span>
                      </div>
                      {mismatch && (
                        <div className="po-txn-mismatch">
                          Payout was {fmtCur(payoutAmt)} — total does not match
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!retryEntry.transactionData.url_image ? (
                  <div className="po-field">
                    <label>Receipt Image *</label>
                    <label className={`po-drop-zone ${retryImageFile ? 'loaded' : ''}`}>
                      <span className="po-drop-icon">{retryImageFile ? '✅' : '🧾'}</span>
                      <span className="po-drop-main">{retryImageFile ? retryImageFile.name : 'Click to attach receipt'}</span>
                      <span className="po-drop-hint">JPG, PNG, PDF accepted</span>
                      <input type="file" accept="image/*,.pdf" onChange={e => setRetryImageFile(e.target.files[0] || null)} />
                    </label>
                  </div>
                ) : (
                  <div className="po-txn-receipt-note">Receipt already uploaded. Click Retry to record the transaction.</div>
                )}

                {retryError && <p className="pin-error" style={{ textAlign: 'left' }}>{retryError}</p>}
              </div>

              <div className="pin-modal-actions" style={{ marginTop: 20 }}>
                <button
                  className="pin-cancel-btn"
                  onClick={() => { setRetryEntry(null); setRetryImageFile(null); setRetryError(''); }}
                  disabled={retrying}
                >
                  Cancel
                </button>
                <button
                  className="pin-auth-btn"
                  onClick={retryFailedTxn}
                  disabled={retrying}
                >
                  {retrying ? 'Recording…' : 'Retry Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Voucher Modal ─────────────────────────────────── */}
      {voucher && (
        <div className="voucher-overlay" onClick={() => setVoucher(null)}>
          <div className="voucher-modal" onClick={(e) => e.stopPropagation()}>
            <div className="voucher-modal-head">
              <div className="voucher-company">
                <div className="voucher-company-name">GIBRO Enterprise LTD</div>
                <div className="voucher-company-meta">Likoni Road, Nairobi · +254710341246</div>
              </div>
              <button className="voucher-close-btn" onClick={() => setVoucher(null)} aria-label="Close">×</button>
            </div>

            <div className="voucher-modal-body">
              <div className="voucher-title-row">
                <h2>Payment Voucher</h2>
                <span className={`po-status-txt ${STATUS_META[voucher.status]?.cls}`}>
                  <span className="po-status-dot" style={{ background: STATUS_META[voucher.status]?.dot }}></span>
                  {STATUS_META[voucher.status]?.label}
                </span>
              </div>

              <div className="voucher-meta-row">
                <div>
                  <span className="voucher-label">Voucher No.</span>
                  <span className="voucher-value mono">{voucher.voucherNumber}</span>
                </div>
                <div>
                  <span className="voucher-label">Date</span>
                  <span className="voucher-value">{fmtDate(voucher.date)}</span>
                </div>
              </div>

              <div className="voucher-section">
                <span className="voucher-label">Paid To</span>
                <div className="voucher-value big">{voucher.recipientName || '—'}</div>
                {voucher.recipientPhone && <div className="voucher-sub">{voucher.recipientPhone}</div>}
                {voucher.destinationAccount && <div className="voucher-sub">Account: {voucher.destinationAccount}</div>}
                {voucher.accountReference && <div className="voucher-sub">Reference: {voucher.accountReference}</div>}
              </div>

              <div className="voucher-grid">
                <div>
                  <span className="voucher-label">Payment Type</span>
                  <span className="voucher-value">{TYPE_LABEL[voucher.type] || voucher.type}</span>
                </div>
                <div>
                  <span className="voucher-label">Initiated By</span>
                  <span className="voucher-value">{voucher.initiatedBy || '—'}</span>
                </div>
                <div>
                  <span className="voucher-label">M-Pesa Transaction Code</span>
                  <span className="voucher-value mono">{voucher.mpesaCode || '—'}</span>
                </div>
                {voucher.staffNo && (
                  <div>
                    <span className="voucher-label">Staff No.</span>
                    <span className="voucher-value">{voucher.staffNo}</span>
                  </div>
                )}
              </div>

              <div className="voucher-desc-block">
                <span className="voucher-label">Description</span>
                <p>{voucher.description || '—'}</p>
              </div>

              <div className="voucher-amount-row">
                <span className="voucher-amount-label">Amount Paid</span>
                <span className="voucher-amount-value">{fmtCur(voucher.amount)}</span>
              </div>
            </div>

            <div className="pin-modal-actions voucher-modal-actions">
              <button className="pin-cancel-btn" onClick={() => setVoucher(null)}>Close</button>
              <PDFDownloadLink
                className="pin-auth-btn voucher-download-link"
                document={<PayoutVoucherPDF voucher={voucher} />}
                fileName={`${voucher.voucherNumber}.pdf`}
              >
                {({ loading }) => (loading ? 'Preparing PDF…' : 'Download PDF')}
              </PDFDownloadLink>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Payouts;
