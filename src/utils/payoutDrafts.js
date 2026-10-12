// Saved payouts: turning payout form state into a stored draft and back.
//
// A draft stores the form as the user filled it, plus snapshot names (project,
// imprest, contact) so that when something has since been deleted or changed we
// can tell the user exactly what it *was*. On load, every reference is re-checked
// against fresh data and problems come back as warnings — nothing is silently fixed.

export const DRAFT_VERSION = 1;

export const DRAFT_TYPES = ['single', 'txn_payout', 'batch_payout'];

export const DRAFT_TYPE_LABEL = {
  single:       'Single Payment',
  txn_payout:   'Transaction Payout',
  batch_payout: 'Batch Payout',
};

const fmtStamp = (d) =>
  new Date(d).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export const normalizePhone = (raw) => {
  let p = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (/^0[17]/.test(p)) p = '254' + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = '254' + p;
  return p;
};

export const isValidPhone = (p) => /^254[17]\d{8}$/.test(normalizePhone(p));

/** "Name — Creator · edited by Editor — 10 Oct 2026, 14:32" */
export const draftTitle = (draft) => {
  const by = draft.creator?.name || 'Unknown';
  const edited = draft.editor?.name ? ` · edited by ${draft.editor.name}` : '';
  return `${draft.name} — ${by}${edited} — ${fmtStamp(draft.createdAt)}`;
};

/** One-line description of what the draft pays, for the saved list. */
export const draftSummary = (draft) => {
  const f = draft.form_data || {};
  const to = (phone, name) => (name ? `${name} (${phone})` : phone);
  if (draft.type === 'single') return `To ${to(f.contact, f.contactName)}${f.description ? ` — ${f.description}` : ''}`;
  if (draft.type === 'txn_payout') {
    const where = f.imprestName
      ? `${f.imprestName}${f.imprestProject ? ` · ${f.imprestProject}` : ''}`
      : `${f.projectName || '—'} / Expenses`;
    return `To ${to(f.contact, f.contactName)} — recorded in ${where}`;
  }
  if (draft.type === 'batch_payout') {
    const n = (f.items || []).length;
    return `To ${to(f.phone, f.contactName)} — ${n} item${n !== 1 ? 's' : ''}`;
  }
  return '';
};

const contactSnapshot = (phone, contacts) => {
  const c = contacts.find(x => normalizePhone(x.phoneNumber) === normalizePhone(phone));
  return c ? { contactId: c.id, contactName: c.name } : { contactId: null, contactName: null };
};

/**
 * Build the stored draft for a form. Returns { error } when the form wouldn't pass
 * the same checks as Pay, otherwise { form_data, amount }.
 */
export const buildDraft = (type, state, { projects, contacts }) => {
  if (type === 'single') {
    const { contact, amount, description } = state;
    const amt = parseFloat(amount);
    if (!contact.trim() || !(amt > 0)) return { error: 'Enter a recipient and an amount before saving.' };
    return {
      amount: amt,
      form_data: { contact: contact.trim(), amount, description, ...contactSnapshot(contact, contacts) },
    };
  }

  if (type === 'txn_payout') {
    const { projectId, contact, amount, description } = state;
    const amt = parseFloat(amount);
    if (!projectId || !contact.trim() || !(amt > 0)) {
      return { error: 'Select a project, a recipient and an amount before saving.' };
    }
    const project = projects.find(p => p.id === projectId);
    return {
      amount: amt,
      form_data: {
        projectId, projectName: project?.name || null,
        contact: contact.trim(), amount, description,
        ...contactSnapshot(contact, contacts),
      },
    };
  }

  if (type === 'batch_payout') {
    const { items, phone } = state;
    if (items.length === 0) return { error: 'Add at least one item before saving.' };
    if (items.some(i => i._issue)) return { error: 'Remove the flagged items before saving.' };
    if (!phone.trim() || !isValidPhone(phone)) return { error: 'Enter a valid Kenyan mobile number before saving.' };
    return {
      amount: items.reduce((s, i) => s + i.amount, 0),
      form_data: {
        items: items.map(({ projectId, projectName, amount, description }) =>
          ({ projectId, projectName, amount, description })),
        phone: phone.trim(),
        ...contactSnapshot(phone, contacts),
      },
    };
  }

  return { error: `Unknown payout type: ${type}` };
};

const checkContact = (phone, contactId, contactName, contacts, warnings) => {
  if (contactId) {
    const c = contacts.find(x => x.id === contactId);
    if (!c) {
      warnings.push(`Saved contact "${contactName}" is no longer in Contacts — confirm the number ${phone} is still right.`);
    } else if (normalizePhone(c.phoneNumber) !== normalizePhone(phone)) {
      warnings.push(`${c.name}'s number has changed from ${phone} to ${c.phoneNumber} in Contacts — update the recipient if needed.`);
    }
  }
  if (phone && !isValidPhone(phone)) warnings.push(`Recipient number ${phone} is not a valid Kenyan mobile number.`);
};

/**
 * Re-check a draft against current data. `projects` is null when it couldn't be
 * loaded — references are then left alone and a warning says so.
 * Returns { form, warnings } where `form` is what to put back into the page state:
 *   single:       { contact, amount, description }
 *   txn_payout:   { projectId, contact, amount, description, projectLabel }
 *   batch_payout: { items (with _issue on unusable lines), phone }
 *
 * Drafts saved before the imprest option was removed may still name an imprest.
 * They are never quietly moved to a project's Expenses account: the destination
 * is cleared (single) or the line flagged (batch) so the user chooses again.
 */
export const checkDraft = (draft, { projects, contacts }) => {
  const f = draft.form_data || {};
  const warnings = [];

  if (draft.form_version > DRAFT_VERSION) {
    warnings.push('This payout was saved by a newer version of the app — refresh the page before using it.');
  }
  if (projects === null) warnings.push('Could not load projects to verify this payout — check the project before paying.');

  if (draft.type === 'single') {
    checkContact(f.contact, f.contactId, f.contactName, contacts, warnings);
    return {
      warnings,
      form: { contact: f.contact || '', amount: String(f.amount ?? ''), description: f.description || '' },
    };
  }

  if (draft.type === 'txn_payout') {
    let projectId = f.projectId || '';
    let project = null;

    if (f.imprestId) {
      warnings.push(`This payout was saved against imprest "${f.imprestName || f.imprestId}", which can no longer be chosen — select a project to record it in that project's Expenses account.`);
      projectId = '';
    } else if (projectId && projects) {
      project = projects.find(p => p.id === projectId) || null;
      if (!project) {
        warnings.push(`Project "${f.projectName || projectId}" no longer exists — select where to record this payment.`);
        projectId = '';
      }
    }
    checkContact(f.contact, f.contactId, f.contactName, contacts, warnings);

    return {
      warnings,
      form: {
        projectId,
        contact: f.contact || '', amount: String(f.amount ?? ''), description: f.description || '',
        projectLabel: project?.name || '',
      },
    };
  }

  if (draft.type === 'batch_payout') {
    const items = (f.items || []).map((item, idx) => {
      let issue = null;
      if (item.imprestId) {
        issue = `Saved against imprest "${item.imprestName || item.imprestId}", which can no longer be chosen`;
      } else if (!item.projectId) {
        issue = 'No project selected';
      } else if (projects && !projects.find(p => p.id === item.projectId)) {
        issue = `Project "${item.projectName || item.projectId}" no longer exists`;
      }
      if (issue) warnings.push(`Item ${idx + 1}: ${issue} — remove it and add it again.`);
      return {
        ...item,
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
        _issue: issue,
      };
    });

    checkContact(f.phone, f.contactId, f.contactName, contacts, warnings);

    return { warnings, form: { items, phone: f.phone || '' } };
  }

  return { warnings: [...warnings, `Unknown payout type: ${draft.type}`], form: null };
};
