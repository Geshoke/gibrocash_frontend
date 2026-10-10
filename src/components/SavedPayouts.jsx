import { useState } from 'react';
import { DRAFT_TYPE_LABEL, draftTitle, draftSummary } from '../utils/payoutDrafts';

const fmtCur = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

const FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'single',       label: 'Single' },
  { key: 'txn_payout',   label: 'Transaction' },
  { key: 'batch_payout', label: 'Batch' },
];

const statusChip = (draft, userId) => {
  if (draft.status === 'submitted') return { cls: 'submitted', text: 'Awaiting M-Pesa' };
  if (draft.status === 'claimed') {
    return draft.claimed_by === userId
      ? { cls: 'claimed', text: 'In use by you' }
      : { cls: 'claimed', text: `In use by ${draft.claimer?.name || 'another user'}` };
  }
  return null;
};

/** The "Saved" view: every active saved payout, with Load / Rename / Discard. */
const SavedPayouts = ({ drafts, loading, userId, canDiscard, busyId, onLoad, onRename, onDiscard }) => {
  const [filter, setFilter] = useState('all');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  const shown = filter === 'all' ? drafts : drafts.filter(d => d.type === filter);

  const startRename = (d) => { setRenamingId(d.id); setRenameValue(d.name); setRenameError(''); };
  const submitRename = async (d) => {
    const name = renameValue.trim();
    if (!name) { setRenameError('Name cannot be empty.'); return; }
    if (name === d.name) { setRenamingId(null); return; }
    const err = await onRename(d, name);
    if (err) setRenameError(err);
    else setRenamingId(null);
  };

  return (
    <>
      <div className="po-panel-header">
        <div>
          <h2>Saved Payouts</h2>
          <p>Payouts saved for later. Loading one fills in its form — paying still needs the director PIN.</p>
        </div>
      </div>

      <div className="po-ledger-toolbar">
        <span className="po-ledger-count">{drafts.length} saved</span>
        <div className="po-ledger-page-size">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`po-page-size-btn${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="po-empty"><p>Loading saved payouts…</p></div>
      ) : shown.length === 0 ? (
        <div className="po-empty">
          <span className="po-empty-icon">🔖</span>
          <p>
            {drafts.length === 0
              ? 'No saved payouts. Use "Save for later" on a Single, Transaction or Batch payout form.'
              : 'No saved payouts of this type.'}
          </p>
        </div>
      ) : (
        <div className="po-saved-list">
          {shown.map(d => {
            const chip = statusChip(d, userId);
            const lockedByOther = d.status === 'submitted' || (d.status === 'claimed' && d.claimed_by !== userId);
            const busy = busyId === d.id;
            return (
              <div key={d.id} className="po-saved-item">
                <div className="po-saved-info">
                  {renamingId === d.id ? (
                    <div className="po-saved-rename">
                      <input
                        type="text"
                        value={renameValue}
                        maxLength={255}
                        autoFocus
                        onChange={e => { setRenameValue(e.target.value); setRenameError(''); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitRename(d);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                      <button className="po-page-size-btn active" onClick={() => submitRename(d)} disabled={busy}>Save</button>
                      <button className="po-page-size-btn" onClick={() => setRenamingId(null)} disabled={busy}>Cancel</button>
                      {renameError && <p className="po-field-error">{renameError}</p>}
                    </div>
                  ) : (
                    <div className="po-saved-title" title={draftTitle(d)}>{draftTitle(d)}</div>
                  )}
                  <div className="po-saved-meta">
                    <span className={`po-type-badge ${d.type}`}>{DRAFT_TYPE_LABEL[d.type]}</span>
                    <span className="po-saved-summary">{draftSummary(d)}</span>
                    {chip && <span className={`po-saved-chip ${chip.cls}`}>{chip.text}</span>}
                  </div>
                </div>
                <div className="po-ar-amount">{fmtCur(d.amount)}</div>
                <div className="po-saved-actions">
                  <button className="po-saved-load-btn" onClick={() => onLoad(d)} disabled={lockedByOther || busy}>
                    {busy ? '…' : 'Load'}
                  </button>
                  <button className="po-page-size-btn" onClick={() => startRename(d)} disabled={lockedByOther || busy || renamingId === d.id}>
                    Rename
                  </button>
                  {canDiscard && (
                    <button className="po-saved-discard-btn" onClick={() => onDiscard(d)} disabled={d.status !== 'available' || busy}>
                      Discard
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

/** Shown above a payout form while it holds a loaded saved payout. */
export const LoadedDraftBanner = ({ draft, warnings, error, onDetach }) => (
  <div className="po-draft-banner">
    <div className="po-draft-banner-head">
      <span>🔖 Loaded <strong>{draft.name}</strong> — paying will use up this saved payout.</span>
      <button className="po-link-btn" onClick={onDetach} title="Keep the form but stop linking it to the saved payout">
        Detach
      </button>
    </div>
    {warnings.length > 0 && (
      <ul className="po-draft-warnings">
        {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
      </ul>
    )}
    {error && <p className="po-field-error">{error}</p>}
  </div>
);

/** Name prompt for "Save for later". When overwriting, the name starts as the saved one. */
export const SaveDraftDialog = ({ overwriting, defaultName, userName, saving, error, onCancel, onSave }) => {
  const [name, setName] = useState(defaultName || '');
  const [openedAt] = useState(() => Date.now());
  const preview = `${name.trim() || 'Name'} — ${overwriting ? `${overwriting.creator?.name || 'Unknown'} · edited by ${userName}` : userName} — ${
    new Date(overwriting ? overwriting.createdAt : openedAt).toLocaleString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`;

  return (
    <div className="pin-overlay">
      <div className="pin-modal">
        <div className="pin-modal-head">
          <div className="pin-lock-icon">🔖</div>
          <h2>{overwriting ? 'Update Saved Payout' : 'Save Payout for Later'}</h2>
        </div>
        <div className="pin-modal-body">
          <p className="pin-desc">
            {overwriting
              ? <>This replaces the details saved in <strong>{overwriting.name}</strong>. No money is sent.</>
              : 'Nothing is sent now. Anyone with payout access can load it later from Saved.'}
          </p>
          <div className="po-field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              maxLength={255}
              autoFocus
              placeholder="e.g. Site B plumbing — final instalment"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && !saving && onSave(name.trim())}
            />
          </div>
          <p className="po-hint">Will appear as: {preview}</p>
          {error && <p className="pin-error">{error}</p>}
          <div className="pin-modal-actions">
            <button className="pin-cancel-btn" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="pin-auth-btn" onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : overwriting ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedPayouts;
