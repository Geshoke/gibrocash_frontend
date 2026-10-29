import { useState, useEffect, useMemo } from 'react';
import { storeService } from '../services/api';
import '../pages/Store.css';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

/**
 * Puts (part of) a paid transaction into the company store, either as more of an
 * existing store item or as a new one. The quantity is in store units, so one
 * transaction line like "20 foam jerricans @ 60,000" can go in as 20 jerricans.
 * `remainingValue` is how much of the transaction hasn't been moved yet.
 */
const MoveToStoreModal = ({ transaction, remainingValue, onClose, onMoved }) => {
  const nothingMovedYet = Math.abs(remainingValue - (transaction.price || 0)) < 0.005;

  const [items, setItems]         = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [mode, setMode]           = useState('existing'); // existing | new
  const [search, setSearch]       = useState('');
  const [storeItemId, setStoreItemId] = useState('');
  const [newItem, setNewItem]     = useState({ name: transaction.item || '', item_type: 'consumable', unit: 'pcs' });
  const [quantity, setQuantity]   = useState(nothingMovedYet ? String(transaction.quantity || '') : '');
  const [value, setValue]         = useState(String(remainingValue));
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    storeService.list()
      .then(res => {
        const list = res.data.items || [];
        setItems(list);
        if (list.length === 0) setMode('new');
      })
      .catch(err => console.error('Failed to load store items:', err))
      .finally(() => setItemsLoading(false));
  }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)) : items;
  }, [items, search]);

  const chosen = items.find(i => i.id === storeItemId);
  const unit = mode === 'existing' ? chosen?.unit : newItem.unit;
  const qty = parseFloat(quantity) || 0;
  const val = parseFloat(value) || 0;

  const save = async () => {
    if (mode === 'existing' && !storeItemId) { setError('Choose the store item, or create a new one.'); return; }
    if (mode === 'new' && !newItem.name.trim()) { setError('Give the new item a name.'); return; }
    if (!(qty > 0)) { setError('Enter how many are going into the store.'); return; }
    if (val < 0 || val > remainingValue + 0.005) { setError(`Value must be between 0 and ${formatCurrency(remainingValue)}.`); return; }

    setSaving(true);
    setError('');
    try {
      const body = { quantity: qty, total_cost: val, note };
      if (mode === 'existing') body.store_item_id = storeItemId;
      else body.new_item = newItem;
      const res = await storeService.moveTransaction(transaction.id, body);
      onMoved(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to move to the store.');
      setSaving(false);
    }
  };

  return (
    <div className="st-modal-overlay" onClick={() => !saving && onClose()}>
      <div className="st-modal" onClick={e => e.stopPropagation()}>
        <div className="st-modal-header">
          <div>
            <h3>Move to Store</h3>
            <p>
              {transaction.item} &middot; {formatCurrency(transaction.price)}
              {!nothingMovedYet && <> &middot; {formatCurrency(remainingValue)} left to move</>}
            </p>
          </div>
          <button className="close-preview-btn" onClick={onClose} disabled={saving}>&times;</button>
        </div>

        <div className="st-form">
          <div className="st-tabs">
            <button className={`st-tab${mode === 'existing' ? ' active' : ''}`} onClick={() => setMode('existing')} disabled={items.length === 0}>
              Existing item
            </button>
            <button className={`st-tab${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')}>
              New item
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="st-field">
              <input
                className="st-search"
                type="search"
                placeholder="Search the store…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <ul className="st-list st-pick-list">
                {itemsLoading && <li className="st-muted st-pick-empty">Loading…</li>}
                {!itemsLoading && matches.length === 0 && <li className="st-muted st-pick-empty">No match — create a new item instead.</li>}
                {matches.map(i => (
                  <li
                    key={i.id}
                    className={`st-list-item${storeItemId === i.id ? ' active' : ''}`}
                    onClick={() => setStoreItemId(i.id)}
                  >
                    <div className="st-list-main">
                      <span className="st-list-name">{i.name}</span>
                      <span className="st-list-sub">
                        <span className={`st-dot ${i.item_type}`} />
                        {i.item_type === 'tool' ? 'Tool' : 'Consumable'}{i.category && <> · {i.category}</>}
                      </span>
                    </div>
                    <div className="st-list-figures">
                      <span className="st-list-qty">{i.quantity_in_store} <small>{i.unit}</small></span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <label className="st-field">
                <span>Item name</span>
                <input type="text" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Foam jerrican 20L" />
              </label>
              <div className="st-type-picker">
                {[
                  { value: 'consumable', title: 'Consumable', hint: 'Used up. Cost goes to the project it’s issued to.' },
                  { value: 'tool', title: 'Tool / Equipment', hint: 'Reused. Stays company property.' },
                ].map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`st-type-option${newItem.item_type === opt.value ? ' active' : ''}`}
                    onClick={() => setNewItem(p => ({ ...p, item_type: opt.value }))}
                  >
                    <strong>{opt.title}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
              <label className="st-field">
                <span>Unit</span>
                <input type="text" value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
                  placeholder="pcs, jerrican, box…" />
              </label>
            </>
          )}

          <div className="st-field-row">
            <label className="st-field">
              <span>Quantity going into store{unit && <em> ({unit})</em>}</span>
              <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </label>
            <label className="st-field">
              <span>Value (KES) <em>— max {formatCurrency(remainingValue)}</em></span>
              <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} />
            </label>
          </div>

          <label className="st-field">
            <span>Note <em>(optional)</em></span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 5 used on site the same day" />
          </label>

          {qty > 0 && (
            <p className="st-cost-note">
              {qty} {unit || 'pcs'} at {formatCurrency(val / qty)} each. {formatCurrency(val)} moves off this
              {transaction.imprest?.project?.name ? ` project (${transaction.imprest.project.name})` : ' project'} and into the store.
            </p>
          )}
          {error && <p className="st-error">{error}</p>}

          <div className="st-form-actions">
            <button className="st-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="st-btn-primary" onClick={save} disabled={saving}>{saving ? 'Moving…' : 'Move to Store'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoveToStoreModal;
