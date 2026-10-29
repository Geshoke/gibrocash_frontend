import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { storeService, projectService } from '../services/api';
import { useTabRefresh } from '../hooks/useTabRefresh';
import './Store.css';

const todayEAT = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

const formatQty = (n) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const MOVEMENT_LABELS = {
  purchase: 'Bought',
  opening: 'Added stock',
  issue: 'Issued to project',
  return: 'Returned from project',
  checkout: 'Checked out',
  checkin: 'Checked in',
  write_off: 'Written off',
};

// Movements that put items into the store (+) vs take them out (−)
const INBOUND = ['purchase', 'opening', 'return', 'checkin'];

const EMPTY_ITEM = {
  name: '', item_type: 'consumable', unit: 'pcs', category: '', location: '', reorder_level: '', description: '',
};
const EMPTY_OPENING = { quantity: '', unit_cost: '', date: todayEAT(), note: '' };

const Store = () => {
  const { canEditStore } = useAuth();
  const canEdit = canEditStore();

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState('all'); // all | consumable | tool
  const [search, setSearch]     = useState('');
  const [lowOnly, setLowOnly]   = useState(false);

  const [selectedId, setSelectedId]   = useState(null);
  const [detail, setDetail]           = useState(null); // { item, movements, holdings }
  const [detailLoading, setDetailLoading] = useState(false);

  const [projects, setProjects] = useState([]);

  // Add item
  const [addOpen, setAddOpen]       = useState(false);
  const [itemForm, setItemForm]     = useState(EMPTY_ITEM);
  const [opening, setOpening]       = useState(EMPTY_OPENING);
  const [addSaving, setAddSaving]   = useState(false);
  const [addError, setAddError]     = useState('');

  // Edit details
  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState(EMPTY_ITEM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  // Movement form: { type, project_id, holder_name, quantity, unit_cost, date, note, source }
  const [movement, setMovement]         = useState(null);
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError]   = useState('');

  const loadItems = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const res = await storeService.list();
      setItems(res.data.items || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load the store.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id, silent = false) => {
    try {
      if (!silent) setDetailLoading(true);
      const res = await storeService.getById(id);
      setDetail(res.data);
    } catch (err) {
      console.error(err);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    projectService.getAll()
      .then(res => setProjects(res.data.projects || []))
      .catch(err => console.error('Failed to load projects:', err));
  }, []);

  useTabRefresh('/store', () => {
    loadItems(true);
    if (selectedId) loadDetail(selectedId, true);
  });

  const selectItem = (id) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setEditing(false);
    setMovement(null);
    loadDetail(id);
  };

  const categories = useMemo(
    () => [...new Set(items.map(i => i.category).filter(Boolean))].sort(),
    [items]
  );

  const summary = useMemo(() => {
    const consumables = items.filter(i => i.item_type === 'consumable');
    const tools = items.filter(i => i.item_type === 'tool');
    return {
      stockValue: consumables.reduce((s, i) => s + i.total_value, 0),
      equipmentValue: tools.reduce((s, i) => s + i.total_value, 0),
      toolsOut: tools.reduce((s, i) => s + i.quantity_out, 0),
      lowStock: items.filter(i => i.low_stock).length,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i =>
      (tab === 'all' || i.item_type === tab) &&
      (!lowOnly || i.low_stock) &&
      (!q || i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q))
    );
  }, [items, tab, search, lowOnly]);

  // ── Add item ────────────────────────────────────────────────
  const openAdd = () => {
    setItemForm(EMPTY_ITEM);
    setOpening({ ...EMPTY_OPENING, date: todayEAT() });
    setAddError('');
    setAddOpen(true);
  };

  const saveAdd = async () => {
    if (!itemForm.name.trim()) { setAddError('Give the item a name.'); return; }
    const payload = { ...itemForm, reorder_level: itemForm.reorder_level === '' ? null : itemForm.reorder_level };
    if (opening.quantity !== '') {
      if (!(parseFloat(opening.quantity) > 0)) { setAddError('Opening quantity must be more than zero.'); return; }
      payload.opening = { ...opening, unit_cost: opening.unit_cost === '' ? 0 : opening.unit_cost };
    }
    setAddSaving(true);
    setAddError('');
    try {
      const res = await storeService.create(payload);
      setAddOpen(false);
      await loadItems(true);
      setTab('all');
      selectItem(res.data.item.id);
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add the item.');
    } finally {
      setAddSaving(false);
    }
  };

  // ── Edit details ────────────────────────────────────────────
  const openEdit = () => {
    const it = detail.item;
    setEditForm({
      name: it.name, item_type: it.item_type, unit: it.unit, category: it.category || '',
      location: it.location || '', reorder_level: it.reorder_level ?? '', description: it.description || '',
    });
    setEditError('');
    setMovement(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await storeService.update(selectedId, { ...editForm, reorder_level: editForm.reorder_level === '' ? null : editForm.reorder_level });
      setEditing(false);
      await Promise.all([loadItems(true), loadDetail(selectedId, true)]);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Movements ───────────────────────────────────────────────
  // `source` pre-selects a holding (where tools are / which project has consumables)
  const openMovement = (type, source = null) => {
    setEditing(false);
    setMovementError('');
    setMovement({
      type,
      project_id: source?.project_id || '',
      holder_name: source?.holder_name || '',
      source: source ? holdingKey(source) : (type === 'write_off' ? 'store' : ''),
      quantity: '',
      unit_cost: '',
      date: todayEAT(),
      note: '',
    });
  };

  const holdingKey = (h) => `${h.project_id || ''}|${h.holder_name || ''}`;

  const saveMovement = async () => {
    const m = movement;
    const body = { movement_type: m.type, quantity: m.quantity, date: m.date, note: m.note };

    if (['return', 'checkin'].includes(m.type) || (m.type === 'write_off' && m.source !== 'store')) {
      const h = (detail.holdings || []).find(x => holdingKey(x) === m.source);
      if (!h) { setMovementError('Choose where the items are coming from.'); return; }
      body.project_id = h.project_id;
      body.holder_name = h.holder_name;
    } else if (m.type === 'issue') {
      if (!m.project_id) { setMovementError('Choose a project.'); return; }
      body.project_id = m.project_id;
    } else if (m.type === 'checkout') {
      if (!m.project_id && !m.holder_name.trim()) { setMovementError('Choose a project or name the person taking them.'); return; }
      body.project_id = m.project_id || null;
      body.holder_name = m.holder_name;
    } else if (m.type === 'opening') {
      body.unit_cost = m.unit_cost === '' ? 0 : m.unit_cost;
    }
    if (!(parseFloat(m.quantity) > 0)) { setMovementError('Enter a quantity.'); return; }
    if (m.type === 'write_off' && !m.note.trim()) { setMovementError('Say why these are being written off.'); return; }

    setMovementSaving(true);
    setMovementError('');
    try {
      await storeService.recordMovement(selectedId, body);
      setMovement(null);
      await Promise.all([loadItems(true), loadDetail(selectedId, true)]);
    } catch (err) {
      setMovementError(err.response?.data?.message || 'Failed to record this.');
    } finally {
      setMovementSaving(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────
  const holdingLabel = (h) => {
    const parts = [];
    if (h.project) parts.push(h.project.name);
    if (h.holder_name) parts.push(h.holder_name);
    return parts.join(' · ') || '—';
  };

  const renderMovementForm = () => {
    const it = detail.item;
    const m = movement;
    const set = (field) => (e) => setMovement(prev => ({ ...prev, [field]: e.target.value }));
    const holdings = detail.holdings || [];
    const fromHolding = ['return', 'checkin'].includes(m.type) || (m.type === 'write_off' && m.source !== 'store');
    const chosenHolding = holdings.find(h => holdingKey(h) === m.source);
    const maxQty = fromHolding ? chosenHolding?.quantity : (m.type === 'opening' ? null : it.quantity_in_store);
    const qty = parseFloat(m.quantity) || 0;

    const titles = {
      opening: 'Add stock',
      issue: 'Issue to a project',
      return: 'Return from a project',
      checkout: 'Check out',
      checkin: 'Check in',
      write_off: 'Write off',
    };

    let costNote = null;
    if (m.type === 'issue' && qty > 0) {
      costNote = `${formatCurrency(qty * it.avg_unit_cost)} will be charged to the project (${formatCurrency(it.avg_unit_cost)} per ${it.unit}).`;
    } else if (m.type === 'return' && qty > 0 && chosenHolding) {
      costNote = `${formatCurrency(qty * chosenHolding.value / chosenHolding.quantity)} will be credited back to the project.`;
    } else if (m.type === 'write_off' && qty > 0) {
      costNote = `${formatCurrency(qty * it.avg_unit_cost)} comes off the store value.`;
    } else if (m.type === 'opening' && qty > 0) {
      costNote = `Adds ${formatCurrency(qty * (parseFloat(m.unit_cost) || 0))} to the store value.`;
    } else if (m.type === 'checkout') {
      costNote = 'Tools stay company property — no cost moves to the project.';
    }

    return (
      <div className="st-movement-form">
        <div className="st-movement-form-header">
          <h4>{titles[m.type]}</h4>
          <button className="st-link-btn" onClick={() => setMovement(null)} disabled={movementSaving}>Cancel</button>
        </div>

        {m.type === 'issue' && (
          <label className="st-field">
            <span>Project</span>
            <select value={m.project_id} onChange={set('project_id')}>
              <option value="">Choose a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        {m.type === 'checkout' && (
          <div className="st-field-row">
            <label className="st-field">
              <span>Project <em>(optional)</em></span>
              <select value={m.project_id} onChange={set('project_id')}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="st-field">
              <span>Taken by</span>
              <input type="text" value={m.holder_name} onChange={set('holder_name')} placeholder="e.g. Juma (site lead)" />
            </label>
          </div>
        )}

        {m.type === 'write_off' && it.item_type === 'tool' && holdings.length > 0 && (
          <label className="st-field">
            <span>From</span>
            <select value={m.source} onChange={set('source')}>
              <option value="store">The store ({formatQty(it.quantity_in_store)} {it.unit})</option>
              {holdings.map(h => (
                <option key={holdingKey(h)} value={holdingKey(h)}>{holdingLabel(h)} ({formatQty(h.quantity)} {it.unit})</option>
              ))}
            </select>
          </label>
        )}

        {['return', 'checkin'].includes(m.type) && (
          <label className="st-field">
            <span>{m.type === 'return' ? 'Returning from' : 'Coming back from'}</span>
            {holdings.length === 0 ? (
              <p className="st-muted">Nothing is out right now.</p>
            ) : (
              <select value={m.source} onChange={set('source')}>
                <option value="">Choose…</option>
                {holdings.map(h => (
                  <option key={holdingKey(h)} value={holdingKey(h)}>{holdingLabel(h)} ({formatQty(h.quantity)} {it.unit})</option>
                ))}
              </select>
            )}
          </label>
        )}

        <div className="st-field-row">
          <label className="st-field">
            <span>Quantity ({it.unit}){maxQty != null && <em> — max {formatQty(maxQty)}</em>}</span>
            <input type="number" min="0" step="any" value={m.quantity} onChange={set('quantity')} />
          </label>
          {m.type === 'opening' && (
            <label className="st-field">
              <span>Unit cost (KES)</span>
              <input type="number" min="0" step="0.01" value={m.unit_cost} onChange={set('unit_cost')} placeholder="0 if unknown" />
            </label>
          )}
          <label className="st-field">
            <span>Date</span>
            <input type="date" value={m.date} max={todayEAT()} onChange={set('date')} />
          </label>
        </div>

        <label className="st-field">
          <span>{m.type === 'write_off' ? 'Reason' : 'Note'} {m.type !== 'write_off' && <em>(optional)</em>}</span>
          <input
            type="text"
            value={m.note}
            onChange={set('note')}
            placeholder={m.type === 'write_off' ? 'e.g. Worn out, broken handle, lost on site' : ''}
          />
        </label>

        {costNote && <p className="st-cost-note">{costNote}</p>}
        {movementError && <p className="st-error">{movementError}</p>}

        <button className="st-btn-primary" onClick={saveMovement} disabled={movementSaving}>
          {movementSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  };

  const renderItemFields = (form, setForm, isNew) => {
    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
    return (
      <>
        <label className="st-field">
          <span>Name</span>
          <input type="text" value={form.name} onChange={set('name')} placeholder="e.g. 8mm masonry drill bit" autoFocus={isNew} />
        </label>

        <div className="st-type-picker">
          {[
            { value: 'consumable', title: 'Consumable', hint: 'Used up on a job — foam, screws, cement. Its cost goes to the project it’s issued to.' },
            { value: 'tool', title: 'Tool / Equipment', hint: 'Reused and returned — hammers, drill bits, ladders. Stays company property.' },
          ].map(opt => (
            <button
              type="button"
              key={opt.value}
              className={`st-type-option${form.item_type === opt.value ? ' active' : ''}`}
              onClick={() => setForm(prev => ({ ...prev, item_type: opt.value }))}
            >
              <strong>{opt.title}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>

        <div className="st-field-row">
          <label className="st-field">
            <span>Unit</span>
            <input type="text" value={form.unit} onChange={set('unit')} placeholder="pcs, box, litres…" />
          </label>
          <label className="st-field">
            <span>Category <em>(optional)</em></span>
            <input type="text" list="st-categories" value={form.category} onChange={set('category')} placeholder="e.g. Drilling" />
          </label>
        </div>
        <div className="st-field-row">
          <label className="st-field">
            <span>Kept at <em>(optional)</em></span>
            <input type="text" value={form.location} onChange={set('location')} placeholder="e.g. Shelf B, blue box" />
          </label>
          <label className="st-field">
            <span>Alert when at or below <em>(optional)</em></span>
            <input type="number" min="0" step="any" value={form.reorder_level} onChange={set('reorder_level')} />
          </label>
        </div>
        <label className="st-field">
          <span>Description <em>(optional)</em></span>
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <datalist id="st-categories">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
      </>
    );
  };

  const renderDetail = () => {
    if (!selectedId) {
      return <div className="st-detail-empty"><p>Select an item to see its details and history</p></div>;
    }
    if (detailLoading || !detail) {
      return <div className="st-detail-empty"><div className="spinner"></div></div>;
    }
    const it = detail.item;
    const isTool = it.item_type === 'tool';
    const holdings = detail.holdings || [];

    return (
      <>
        <div className="st-detail-header">
          <div>
            <h2>{it.name}</h2>
            <div className="st-detail-tags">
              <span className={`st-type-badge ${it.item_type}`}>{isTool ? 'Tool / Equipment' : 'Consumable'}</span>
              {it.category && <span className="st-tag">{it.category}</span>}
              {it.low_stock && <span className="st-low-badge">Low stock</span>}
            </div>
          </div>
          <div className="st-detail-header-actions">
            {canEdit && !editing && <button className="st-edit-btn" onClick={openEdit}>Edit</button>}
            <button className="close-preview-btn" onClick={() => { setSelectedId(null); setDetail(null); }}>&times;</button>
          </div>
        </div>

        <div className="st-detail-body">
          {editing ? (
            <div className="st-form">
              {renderItemFields(editForm, setEditForm, false)}
              {editError && <p className="st-error">{editError}</p>}
              <div className="st-form-actions">
                <button className="st-btn-secondary" onClick={() => setEditing(false)} disabled={editSaving}>Cancel</button>
                <button className="st-btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="st-stats">
                <div className="st-stat">
                  <span className="st-stat-label">In store</span>
                  <span className="st-stat-value">{formatQty(it.quantity_in_store)} <small>{it.unit}</small></span>
                </div>
                {isTool && (
                  <div className="st-stat">
                    <span className="st-stat-label">Out</span>
                    <span className="st-stat-value">{formatQty(it.quantity_out)} <small>{it.unit}</small></span>
                  </div>
                )}
                {isTool && (
                  <div className="st-stat">
                    <span className="st-stat-label">Owned</span>
                    <span className="st-stat-value">{formatQty(it.quantity_owned)} <small>{it.unit}</small></span>
                  </div>
                )}
                <div className="st-stat">
                  <span className="st-stat-label">Value</span>
                  <span className="st-stat-value">{formatCurrency(it.total_value)}</span>
                </div>
                <div className="st-stat">
                  <span className="st-stat-label">Avg. cost</span>
                  <span className="st-stat-value">{formatCurrency(it.avg_unit_cost)} <small>/ {it.unit}</small></span>
                </div>
              </div>

              <div className="st-info-grid">
                <div><span>Kept at</span><strong>{it.location || '—'}</strong></div>
                <div><span>Alert at</span><strong>{it.reorder_level != null ? `${formatQty(it.reorder_level)} ${it.unit}` : '—'}</strong></div>
                <div><span>Added by</span><strong>{it.creator?.name || '—'} · {formatDate(it.createdAt)}</strong></div>
                {it.description && <div className="st-info-wide"><span>Description</span><strong>{it.description}</strong></div>}
              </div>

              {canEdit && !movement && (
                <div className="st-actions">
                  <button className="st-action add" onClick={() => openMovement('opening')}>+ Add stock</button>
                  {isTool ? (
                    <>
                      <button className="st-action out" onClick={() => openMovement('checkout')} disabled={it.quantity_in_store <= 0}>Check out</button>
                      <button className="st-action in" onClick={() => openMovement('checkin')} disabled={holdings.length === 0}>Check in</button>
                    </>
                  ) : (
                    <>
                      <button className="st-action out" onClick={() => openMovement('issue')} disabled={it.quantity_in_store <= 0}>Issue to project</button>
                      <button className="st-action in" onClick={() => openMovement('return')} disabled={holdings.length === 0}>Return</button>
                    </>
                  )}
                  <button className="st-action writeoff" onClick={() => openMovement('write_off')} disabled={it.quantity_owned <= 0}>Write off</button>
                </div>
              )}
              {canEdit && movement && renderMovementForm()}

              <section className="st-section">
                <h3>{isTool ? 'Out on sites / with people' : 'Issued to projects'}</h3>
                {holdings.length === 0 ? (
                  <p className="st-muted">{isTool ? 'Everything is in the store.' : 'None issued (or all returned).'}</p>
                ) : (
                  <ul className="st-holdings">
                    {holdings.map(h => (
                      <li key={holdingKey(h)}>
                        <div>
                          <strong>{holdingLabel(h)}</strong>
                          <span>{formatQty(h.quantity)} {it.unit}{!isTool && ` · ${formatCurrency(h.value)} charged`}</span>
                        </div>
                        {canEdit && !movement && (
                          <div className="st-holding-actions">
                            <button className="st-link-btn" onClick={() => openMovement(isTool ? 'checkin' : 'return', h)}>
                              {isTool ? 'Check in' : 'Return'}
                            </button>
                            {isTool && (
                              <button className="st-link-btn danger" onClick={() => openMovement('write_off', h)}>Lost / broken</button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="st-section">
                <h3>History</h3>
                {detail.movements.length === 0 ? (
                  <p className="st-muted">No stock recorded yet.</p>
                ) : (
                  <ul className="st-history">
                    {detail.movements.map(m => {
                      const inbound = INBOUND.includes(m.movement_type);
                      const where = [m.project?.name, m.holder_name].filter(Boolean).join(' · ');
                      return (
                        <li key={m.id} className={`st-history-item ${m.movement_type}`}>
                          <div className="st-history-main">
                            <span className="st-history-type">{MOVEMENT_LABELS[m.movement_type]}</span>
                            <span className={`st-history-qty ${inbound ? 'in' : 'out'}`}>
                              {inbound ? '+' : '−'}{formatQty(m.quantity)} {it.unit}
                            </span>
                          </div>
                          <div className="st-history-meta">
                            {formatDate(m.movement_date)}
                            {where && <> · {m.movement_type === 'purchase' ? `bought on ${where}` : where}</>}
                            {m.total_cost > 0 && <> · {formatCurrency(m.total_cost)}</>}
                            {m.recorder?.name && <> · by {m.recorder.name}</>}
                          </div>
                          {m.source_transaction && (
                            <div className="st-history-source">
                              From transaction “{m.source_transaction.item}”
                              {m.source_transaction.imprest?.name && <> in {m.source_transaction.imprest.name}</>}
                              {' '}({formatCurrency(m.source_transaction.price)})
                            </div>
                          )}
                          {m.note && <div className="st-history-note">{m.note}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </>
    );
  };

  const openingQty = parseFloat(opening.quantity) || 0;
  const openingCost = parseFloat(opening.unit_cost) || 0;

  return (
    <div className="store-page">
      <div className="st-page-header">
        <div>
          <h1>Store</h1>
          <p>Everything the company owns — consumables in stock and tools &amp; equipment</p>
        </div>
        {canEdit && <button className="st-btn-primary" onClick={openAdd}>+ Add Item</button>}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="st-summary">
        <div className="st-summary-card stock">
          <span>Stock value</span>
          <strong>{formatCurrency(summary.stockValue)}</strong>
        </div>
        <div className="st-summary-card equipment">
          <span>Equipment value</span>
          <strong>{formatCurrency(summary.equipmentValue)}</strong>
        </div>
        <div className="st-summary-card out">
          <span>Tools out</span>
          <strong>{formatQty(summary.toolsOut)}</strong>
        </div>
        <button
          type="button"
          className={`st-summary-card low${lowOnly ? ' active' : ''}`}
          onClick={() => setLowOnly(v => !v)}
          title="Show only items at or below their alert level"
        >
          <span>Low stock</span>
          <strong>{summary.lowStock}</strong>
        </button>
      </div>

      <div className="st-layout">
        <div className="st-list-panel">
          <div className="st-toolbar">
            <div className="st-tabs">
              {[['all', 'All'], ['consumable', 'Stock'], ['tool', 'Equipment']].map(([value, label]) => (
                <button key={value} className={`st-tab${tab === value ? ' active' : ''}`} onClick={() => setTab(value)}>
                  {label}
                </button>
              ))}
            </div>
            <input
              className="st-search"
              type="search"
              placeholder="Search name or category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="st-detail-empty"><div className="spinner"></div></div>
          ) : visibleItems.length === 0 ? (
            <div className="st-empty">
              <p>{items.length === 0 ? 'The store is empty.' : 'No items match.'}</p>
              {items.length === 0 && canEdit && (
                <p className="st-muted">
                  Add items you already have with <strong>+ Add Item</strong>, or use <strong>Move to Store</strong> on a transaction.
                </p>
              )}
            </div>
          ) : (
            <ul className="st-list">
              {visibleItems.map(i => (
                <li
                  key={i.id}
                  className={`st-list-item${selectedId === i.id ? ' active' : ''}`}
                  onClick={() => selectItem(i.id)}
                >
                  <div className="st-list-main">
                    <span className="st-list-name">{i.name}</span>
                    <span className="st-list-sub">
                      <span className={`st-dot ${i.item_type}`} />
                      {i.item_type === 'tool' ? 'Tool' : 'Consumable'}
                      {i.category && <> · {i.category}</>}
                      {i.low_stock && <span className="st-low-badge small">Low</span>}
                    </span>
                  </div>
                  <div className="st-list-figures">
                    <span className="st-list-qty">
                      {formatQty(i.quantity_in_store)} <small>{i.unit}</small>
                    </span>
                    {i.item_type === 'tool' && i.quantity_out > 0 && (
                      <span className="st-list-out">{formatQty(i.quantity_out)} out</span>
                    )}
                    <span className="st-list-value">{formatCurrency(i.total_value)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`st-detail-panel${selectedId ? ' visible' : ''}`}>
          {renderDetail()}
        </div>
      </div>

      {addOpen && (
        <div className="st-modal-overlay" onClick={() => !addSaving && setAddOpen(false)}>
          <div className="st-modal" onClick={e => e.stopPropagation()}>
            <div className="st-modal-header">
              <div>
                <h3>Add item to store</h3>
                <p>For things the company already has. Items bought through GibroCash go in with <strong>Move to Store</strong> on the transaction.</p>
              </div>
              <button className="close-preview-btn" onClick={() => setAddOpen(false)}>&times;</button>
            </div>

            <div className="st-form">
              {renderItemFields(itemForm, setItemForm, true)}

              <fieldset className="st-opening">
                <legend>Current stock <em>(optional)</em></legend>
                <div className="st-field-row">
                  <label className="st-field">
                    <span>Quantity on hand</span>
                    <input type="number" min="0" step="any" value={opening.quantity}
                      onChange={e => setOpening(p => ({ ...p, quantity: e.target.value }))} />
                  </label>
                  <label className="st-field">
                    <span>Unit cost (KES)</span>
                    <input type="number" min="0" step="0.01" value={opening.unit_cost} placeholder="0 if unknown"
                      onChange={e => setOpening(p => ({ ...p, unit_cost: e.target.value }))} />
                  </label>
                  <label className="st-field">
                    <span>As of</span>
                    <input type="date" value={opening.date} max={todayEAT()}
                      onChange={e => setOpening(p => ({ ...p, date: e.target.value }))} />
                  </label>
                </div>
                <label className="st-field">
                  <span>Note <em>(optional)</em></span>
                  <input type="text" value={opening.note} placeholder="e.g. Bought 2025, before GibroCash"
                    onChange={e => setOpening(p => ({ ...p, note: e.target.value }))} />
                </label>
                {openingQty > 0 && (
                  <p className="st-cost-note">
                    {formatQty(openingQty)} {itemForm.unit || 'pcs'} worth {formatCurrency(openingQty * openingCost)}
                  </p>
                )}
              </fieldset>

              {addError && <p className="st-error">{addError}</p>}
              <div className="st-form-actions">
                <button className="st-btn-secondary" onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</button>
                <button className="st-btn-primary" onClick={saveAdd} disabled={addSaving}>{addSaving ? 'Adding…' : 'Add to store'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Store;
