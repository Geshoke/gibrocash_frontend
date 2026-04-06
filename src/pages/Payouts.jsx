import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { payoutService, imprestService, transactionService, imageService } from '../services/api';
import './Payouts.css';

// ── Constants ──────────────────────────────────────────────────
const PIN_TIMEOUT_SECS = 600;

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

const TYPE_LABEL = { payroll: 'Payroll', single: 'Single Payment', b2b: 'B2B Payment', txn_payout: 'Transaction Payout' };

const NAV_ITEMS = [
  { key: 'payroll',     icon: '💰', label: 'Payroll'             },
  { key: 'single',      icon: '📤', label: 'Single Payment'      },
  { key: 'b2b',         icon: '🏦', label: 'B2B Payment'         },
  { key: 'txn_payout',  icon: '💳', label: 'Transaction Payout'  },
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
  const { user, canViewAllImprests } = useAuth();
  const [view, setView] = useState('history');

  // ── Contacts (persisted in localStorage) ────────────────────
  const [contacts, setContacts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gibrocash_contacts') || '[]'); }
    catch { return []; }
  });
  const [contactForm, setContactForm] = useState({ staffNo: '', name: '', phoneNumber: '' });
  const [contactError, setContactError] = useState('');

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
  const [history, setHistory]   = useState([]);
  const [expanded, setExpanded] = useState(null);

  // ── Transaction Payout ───────────────────────────────────────
  const [imprests, setImprests]             = useState([]);
  const [imprestsLoading, setImprestsLoading] = useState(false);
  const [txnPayout, setTxnPayout]           = useState({ imprestId: '', contact: '', amount: '', description: '' });
  const [imprestSearch, setImprestSearch]   = useState('');
  const [imprestOpen, setImprestOpen]       = useState(false);
  const imprestRef                          = useRef(null);
  const [txnRequesting, setTxnRequesting]   = useState(false);
  const [txnSuccess, setTxnSuccess]         = useState('');

  // ── PIN modal step 2 — record transaction ───────────────────
  const [modalStep, setModalStep]         = useState('pin'); // 'pin' | 'record'
  const [txnForm, setTxnForm]             = useState({ item: '', quantity: '1', unitPrice: '', vatEnabled: false });
  const [txnImageFile, setTxnImageFile]   = useState(null);
  const [txnSaving, setTxnSaving]         = useState(false);
  const [txnFormError, setTxnFormError]   = useState('');

  // ── Failed imprest-transaction ledger (localStorage) ────────
  const [failedTxns, setFailedTxns] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gibrocash_failed_txns') || '[]'); }
    catch { return []; }
  });

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

  const fetchLedger = () => {
    payoutService.getPayments()
      .then(({ data }) => {
        const mapped = (data.payments || []).map(p => ({
          id: String(p.id),
          type: 'single',
          label: p.remarks || '—',
          amount: parseFloat(p.amount),
          date: p.initiatedAt,
          status: mapDbStatus(p.status),
          payload: {
            partyB: p.partyB,
            transactionReceipt: p.transactionReceipt,
            receiverPublicName: p.receiverPublicName,
          },
        }));
        setHistory(mapped);
      })
      .catch(() => {}); // silent — stale data is better than a crash
  };

  useEffect(() => { fetchLedger(); }, []); // eslint-disable-line

  // Persist contacts to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('gibrocash_contacts', JSON.stringify(contacts));
  }, [contacts]);

  // Persist failed txn ledger
  useEffect(() => {
    localStorage.setItem('gibrocash_failed_txns', JSON.stringify(failedTxns));
  }, [failedTxns]);

  // Close imprest dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (imprestRef.current && !imprestRef.current.contains(e.target)) {
        setImprestOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load imprests when Transaction Payout view is opened
  useEffect(() => {
    if (view !== 'txn_payout') return;
    if (imprests.length > 0) return;
    setImprestsLoading(true);
    const load = async () => {
      try {
        if (canViewAllImprests()) {
          const { data } = await imprestService.getAdminSummary();
          setImprests((data.response || []).map(imp => ({
            id: imp.id,
            name: imp.imprestName,
            projectName: imp.projectName || imp.project?.name || null,
            remaining: (imp.allocated || 0) - (imp.usedAmount || 0),
          })));
        } else {
          const { data } = await imprestService.getByUser(user.id);
          setImprests((data.response || []).map(imp => ({
            id: imp.id,
            name: imp.name,
            projectName: imp.projectName || imp.project?.name || null,
            remaining: (imp.amount || 0) - (imp.totalTransactionPrice || 0),
          })));
        }
      } catch { /* silent */ } finally {
        setImprestsLoading(false);
      }
    };
    load();
  }, [view]); // eslint-disable-line

  useEffect(() => { modalRef.current = modal; }, [modal]);

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
  const openModal = (type, label, amount, payload, payoutId) => {
    clearInterval(timerRef.current);
    setModal({ id: Date.now().toString(), type, label, amount, payload, payoutId });
    setPin(''); setTimeLeft(PIN_TIMEOUT_SECS); setPinExpired(false); setPinError('');
  };

  const cancelModal = () => {
    clearInterval(timerRef.current);
    setModal(null); setPin('');
    fetchLedger();
  };

  const submitPin = async () => {
    if (pin.length !== 5 || pinExpired || submitting) return;
    setSubmitting(true);
    setPinError('');
    const m = { ...modal };
    try {
      await payoutService.authorise(m.payoutId, pin);

      // Transaction Payout: don't close — move to step 2 (record transaction)
      if (m.type === 'txn_payout') {
        clearInterval(timerRef.current);
        setPin(''); setPinError('');
        setTxnForm({ item: '', quantity: '1', unitPrice: '', vatEnabled: false });
        setTxnImageFile(null); setTxnFormError('');
        setModalStep('record');
        setSubmitting(false);
        return;
      }

      clearInterval(timerRef.current);
      setModal(null); setPin('');
      fetchLedger();
      if (m.type === 'payroll') { setXlsxRows([]); setPayrollName(''); setInlinePhones({}); }
      if (m.type === 'single')  setSingle({ contact: '', amount: '', description: '' });
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
  const addContact = () => {
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
    setContacts(prev => [
      ...prev,
      { id: Date.now().toString(), staffNo, name, phoneNumber: normalizePhone(phone) },
    ]);
    setContactForm({ staffNo: '', name: '', phoneNumber: '' });
    setContactError('');
  };

  const deleteContact = (id) => setContacts(prev => prev.filter(c => c.id !== id));

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
    const label = `Payment to ${single.contact}`;
    const amount = parseFloat(single.amount) || 0;
    const payload = {
      phoneNumber: normalizePhone(single.contact),
      amount,
      remarks:     single.description || 'Payment',
      description: single.description,
    };
    setRequesting(true);
    try {
      const { data } = await payoutService.request({ type: 'single', payload, label, amount });
      openModal('single', label, amount, { ...single }, data.payoutId);
    } catch {
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
    const { imprestId, contact, amount, description } = txnPayout;
    if (!imprestId || !contact.trim() || !amount || txnRequesting) return;
    const selectedImprest = imprests.find(i => String(i.id) === String(imprestId));
    const label  = `Payment to ${contact}`;
    const amt    = parseFloat(amount) || 0;
    const payload = { phoneNumber: normalizePhone(contact), amount: amt, remarks: description || 'Transaction Payout' };
    setTxnRequesting(true);
    try {
      const { data } = await payoutService.request({ type: 'single', payload, label, amount: amt });
      setModalStep('pin');
      openModal('txn_payout', label, amt, { ...txnPayout, imprest: selectedImprest }, data.payoutId);
    } catch {
      alert('Failed to initiate payout. Please try again.');
    } finally {
      setTxnRequesting(false);
    }
  };

  const cancelRecord = () => {
    if (!window.confirm('The payout succeeded. Cancel transaction recording? It will be saved to Action Required for retry.')) return;
    const m = modal;
    const { vat, total } = getTxnTotals(txnForm);
    const entry = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      payoutLabel: m.label,
      payoutAmount: m.amount,
      imprestName: m.payload.imprest.name,
      imprestProject: m.payload.imprest.projectName || null,
      transactionData: {
        imprestAccount_id: m.payload.imprest.id,
        item: txnForm.item.trim(),
        itemQuantity: parseFloat(txnForm.quantity) || 1,
        unitPrice: parseFloat(txnForm.unitPrice) || 0,
        Total_amount: total,
        userID: user.id,
        vat_charged: vat,
        url_image: null,
      },
    };
    setFailedTxns(prev => [entry, ...prev]);
    setModal(null);
    setModalStep('pin');
  };

  const handleSaveTxnRecord = async () => {
    if (txnSaving) return;
    const { item, quantity, unitPrice } = txnForm;
    const { vat, total } = getTxnTotals(txnForm);
    const imprest = modal?.payload?.imprest;

    if (!item.trim() || !quantity || !unitPrice) {
      setTxnFormError('Please fill in all required fields.');
      return;
    }
    if (!txnImageFile) {
      setTxnFormError('Please attach a receipt image.');
      return;
    }

    setTxnSaving(true);
    setTxnFormError('');

    // 1. Upload receipt
    let imageFilename = null;
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

    // 2. Create transaction
    const txnData = {
      imprestAccount_id: imprest.id,
      item:              item.trim(),
      itemQuantity:      parseFloat(quantity),
      unitPrice:         parseFloat(unitPrice),
      Total_amount:      total,
      userID:            user.id,
      vat_charged:       vat,
      url_image:         imageFilename,
    };

    try {
      await transactionService.create(txnData);
      setModal(null);
      setModalStep('pin');
      setTxnPayout({ imprestId: '', contact: '', amount: '', description: '' });
      setTxnForm({ item: '', quantity: '1', unitPrice: '', vatEnabled: false });
      setTxnImageFile(null);
      setTxnSuccess('Payout completed and transaction recorded successfully.');
      setTimeout(() => setTxnSuccess(''), 6000);
      fetchLedger();
    } catch {
      // Save to Action Required ledger
      const entry = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        payoutLabel: modal.label,
        payoutAmount: modal.amount,
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

    let txnData = {
      imprestAccount_id: retryEntry.transactionData.imprestAccount_id,
      item:              item.trim(),
      itemQuantity:      parseFloat(quantity),
      unitPrice:         parseFloat(unitPrice),
      Total_amount:      total,
      userID:            retryEntry.transactionData.userID,
      vat_charged:       vat,
      url_image:         imageFilename,
    };

    try {
      await transactionService.create(txnData);
      setFailedTxns(prev => prev.filter(f => f.id !== retryEntry.id));
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

  const txnPayoutReady = txnPayout.imprestId && txnPayout.contact.trim() && txnPayout.amount;

  // ── Render ───────────────────────────────────────────────────
  return (
    <Layout>
      <div className="po-page">

        {/* ── Row 1: Hero cards ─────────────────────────────── */}
        <div className="po-hero-row">
          <div className="po-hero-card primary">
            <div className="po-hero-pill">● AVAILABLE TO DISBURSE</div>
            <div className="po-hero-amount">KES —</div>
            <div className="po-hero-sub">Source: <span className="po-hero-src">M-Pesa Business Account</span></div>
            <div className="po-hero-indicators">
              <span className="po-ind"><span className="po-ind-dot green"></span>System operational</span>
              <span className="po-ind"><span className="po-ind-dot blue"></span>Daraja API connected</span>
            </div>
          </div>

          <div className="po-hero-card secondary">
            <div className="po-hero-pill muted">AMOUNT IN ACCOUNT</div>
            <div className="po-hero-amount dim">KES —</div>
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

            {view === 'history' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Transaction Ledger</h2>
                    <p>Real-time payout activity</p>
                  </div>
                </div>

                {/* ── Action Required ───────────────────────── */}
                {failedTxns.length > 0 && (
                  <div className="po-action-required">
                    <div className="po-ar-header">
                      <span className="po-ar-icon">⚠</span>
                      <strong>Action Required</strong>
                      <span className="po-ar-count">{failedTxns.length} failed imprest transaction{failedTxns.length > 1 ? 's' : ''}</span>
                    </div>
                    {failedTxns.map(entry => (
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
                )}

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
                                          <th>Staff No</th>
                                          <th>Employee Name</th>
                                          <th>Net Pay</th>
                                          <th>Phone</th>
                                          <th>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entry.payload.rows.map(row => (
                                          <tr key={row._id}>
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
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>
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
                      disabled={!single.contact.trim() || !single.amount || requesting}>
                      {requesting ? 'Sending SMS…' : 'Initiate Payment'}
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
                    <p>Send a payment to an individual and record it against an imprest. Director PIN required.</p>
                  </div>
                </div>
                <div className="po-form narrow">
                  <p className="po-min-notice">Minimum transaction amount: <strong>KES 10</strong> (Safaricom B2C limit)</p>

                  {/* Step 1 — Select imprest */}
                  <div className="po-txp-section-label">Step 1 — Select Imprest</div>
                  <div className="po-field" ref={imprestRef} style={{ position: 'relative' }}>
                    <label>Imprest Account</label>
                    {imprestsLoading ? (
                      <div className="po-txp-loading">Loading imprests…</div>
                    ) : (
                      <>
                        <input
                          type="text"
                          className="po-txp-search"
                          placeholder="Search imprest…"
                          value={imprestSearch}
                          onFocus={() => setImprestOpen(true)}
                          onChange={e => {
                            setImprestSearch(e.target.value);
                            setImprestOpen(true);
                            // clear selection when user starts typing a new search
                            if (txnPayout.imprestId) setTxnPayout(p => ({ ...p, imprestId: '' }));
                          }}
                        />
                        {imprestOpen && (
                          <div className="po-txp-dropdown">
                            {imprests
                              .filter(imp => {
                                const q = imprestSearch.toLowerCase();
                                return (
                                  imp.name.toLowerCase().includes(q) ||
                                  (imp.projectName || '').toLowerCase().includes(q)
                                );
                              })
                              .map(imp => (
                                <div
                                  key={imp.id}
                                  className={`po-txp-option${String(txnPayout.imprestId) === String(imp.id) ? ' selected' : ''}`}
                                  onMouseDown={() => {
                                    setTxnPayout(p => ({ ...p, imprestId: imp.id }));
                                    setImprestSearch(`${imp.name}${imp.projectName ? ` · ${imp.projectName}` : ''}`);
                                    setImprestOpen(false);
                                  }}
                                >
                                  <div className="po-txp-opt-name">{imp.name}{imp.projectName ? <span className="po-txp-opt-proj"> · {imp.projectName}</span> : ''}</div>
                                  <div className="po-txp-opt-bal">{fmtCur(imp.remaining)}</div>
                                </div>
                              ))
                            }
                            {imprests.filter(imp => {
                              const q = imprestSearch.toLowerCase();
                              return imp.name.toLowerCase().includes(q) || (imp.projectName || '').toLowerCase().includes(q);
                            }).length === 0 && (
                              <div className="po-txp-no-results">No imprests match your search</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Step 2 — Payment details */}
                  <div className="po-txp-section-label">Step 2 — Payment Details</div>
                  <div className="po-field">
                    <label>Recipient Phone Number</label>
                    <input
                      type="text"
                      value={txnPayout.contact}
                      onChange={e => setTxnPayout(p => ({ ...p, contact: e.target.value }))}
                      placeholder="e.g. 0712345678"
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
                      placeholder="e.g. Payment for plumbing services"
                      rows={3}
                    />
                  </div>

                  {txnPayout.contact && txnPayout.amount && txnPayout.imprestId && (
                    <div className="po-preview">
                      Sending <strong>{fmtCur(txnPayout.amount)}</strong> to <strong>{txnPayout.contact}</strong>
                      {' '}— will be recorded in <strong>{imprests.find(i => String(i.id) === String(txnPayout.imprestId))?.name}</strong>
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
                  </div>
                </div>
              </>
            )}

            {/* ── Contacts ─────────────────────────────────── */}
            {view === 'contacts' && (
              <>
                <div className="po-panel-header">
                  <div>
                    <h2>Employee Contacts</h2>
                    <p>Phone numbers saved here auto-fill during payroll import.</p>
                  </div>
                </div>
                <div className="po-form">

                  {/* Add contact form */}
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

                  {/* Contact list */}
                  {contacts.length > 0 ? (
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
                                <button
                                  className="po-del-btn"
                                  onClick={() => deleteContact(c.id)}
                                  title="Remove contact"
                                >
                                  ✕
                                </button>
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
      {modal && (
        <div className="pin-overlay" onClick={e => {
          if (e.target !== e.currentTarget) return;
          if (modalStep === 'record') return; // must use Cancel or Save buttons
          if (!pinExpired) cancelModal();
        }}>
          <div className={`pin-modal${modalStep === 'record' ? ' wide' : ''}`}>
            <div className="pin-modal-head">
              <div className="pin-lock-icon">{modalStep === 'record' ? '🧾' : pinExpired ? '⏰' : '🔐'}</div>
              <h2>{modalStep === 'record' ? 'Record Transaction' : pinExpired ? 'Approval Window Closed' : 'Director Approval Required'}</h2>
            </div>
            <div className="pin-modal-body">

              {/* ── Step 2: Transaction record form ──────── */}
              {modalStep === 'record' && (
                <>
                  <p className="pin-desc">
                    Payout authorised. Fill in the transaction details and attach the receipt to record it in the imprest.
                  </p>
                  <div className="po-txn-record-form">
                    <div className="po-field">
                      <label>Item / Description *</label>
                      <input
                        type="text"
                        value={txnForm.item}
                        onChange={e => setTxnForm(p => ({ ...p, item: e.target.value }))}
                        placeholder="e.g. Plumbing materials"
                      />
                    </div>
                    <div className="po-txn-row">
                      <div className="po-field">
                        <label>Quantity *</label>
                        <input
                          type="number"
                          value={txnForm.quantity}
                          onChange={e => setTxnForm(p => ({ ...p, quantity: e.target.value }))}
                          min="1" step="1" placeholder="1"
                        />
                      </div>
                      <div className="po-field">
                        <label>Unit Price (KES) *</label>
                        <input
                          type="number"
                          value={txnForm.unitPrice}
                          onChange={e => setTxnForm(p => ({ ...p, unitPrice: e.target.value }))}
                          min="0" step="0.01" placeholder="0.00"
                        />
                      </div>
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

                    {/* Totals breakdown */}
                    {(() => {
                      const { subtotal, vat, total } = getTxnTotals(txnForm);
                      const payoutAmt = modal?.amount || 0;
                      const mismatch  = txnForm.quantity && txnForm.unitPrice && total !== payoutAmt;
                      return (
                        <div className="po-txn-totals">
                          <div className="po-txn-total-row">
                            <span>Subtotal</span><span>{fmtCur(subtotal)}</span>
                          </div>
                          {txnForm.vatEnabled && (
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

                    {/* Receipt upload */}
                    <div className="po-field">
                      <label>Receipt Image *</label>
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
                    <button className="pin-cancel-btn" onClick={cancelRecord} disabled={txnSaving}>
                      Cancel
                    </button>
                    <button
                      className="pin-auth-btn"
                      onClick={handleSaveTxnRecord}
                      disabled={txnSaving}
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
                  <button className="pin-cancel-btn" onClick={() => { setModal(null); setPin(''); setModalStep('pin'); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Retry Modal (Action Required) ──────────────────── */}
      {retryEntry && (
        <div className="pin-overlay" onClick={e => e.target === e.currentTarget && !retrying && setRetryEntry(null)}>
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
    </Layout>
  );
};

export default Payouts;
