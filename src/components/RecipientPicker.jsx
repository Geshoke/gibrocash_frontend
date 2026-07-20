import { useState, useRef, useEffect } from 'react';

/**
 * Phone-number text input with a button beside it that reveals a scrollable
 * list of saved recipients (fetched from the backend contacts directory).
 * Typing a raw number always works; picking a recipient just fills the field.
 */
const RecipientPicker = ({ value, onChange, recipients = [], placeholder, disabled }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectRecipient = (r) => {
    onChange(r.phone);
    setOpen(false);
  };

  return (
    <div className="po-recipient-picker" ref={wrapRef}>
      <div className="po-recipient-input-row">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'e.g. 0712345678'}
          disabled={disabled}
        />
        <button
          type="button"
          className="po-recipient-picker-btn"
          onClick={() => setOpen(o => !o)}
          disabled={disabled}
          title="Pick from saved recipients"
        >
          👥
        </button>
      </div>
      {open && (
        <div className="po-txp-dropdown po-recipient-dropdown">
          {recipients.length === 0 ? (
            <div className="po-txp-no-results">No saved recipients yet</div>
          ) : (
            recipients.map(r => (
              <div key={r.id} className="po-txp-option" onMouseDown={() => selectRecipient(r)}>
                <div className="po-txp-opt-name">{r.name}</div>
                <div className="po-txp-opt-bal">{r.phone}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default RecipientPicker;
