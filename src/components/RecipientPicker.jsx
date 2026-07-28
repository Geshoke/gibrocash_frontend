import { useState, useRef, useEffect } from 'react';

const RecipientPicker = ({ value, onChange, recipients = [], placeholder, disabled }) => {
  const [open, setOpen]               = useState(false);
  const [search, setSearch]           = useState('');
  const [selectedName, setSelectedName] = useState('');
  const wrapRef  = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  // Clear selected name when the user manually edits the phone field
  const handleInputChange = (e) => {
    onChange(e.target.value);
    setSelectedName('');
  };

  const toggleOpen = () => {
    setSearch('');
    setOpen(o => !o);
  };

  const selectRecipient = (r) => {
    onChange(r.phone);
    setSelectedName(r.name);
    setSearch('');
    setOpen(false);
  };

  const filtered = recipients.filter(r => {
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.phone.includes(q);
  });

  return (
    <div className="po-recipient-picker" ref={wrapRef}>
      <div className="po-recipient-input-row">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder || 'e.g. 0712345678'}
          disabled={disabled}
        />
        <button
          type="button"
          className="po-recipient-picker-btn"
          onClick={toggleOpen}
          disabled={disabled}
          title="Pick from saved recipients"
        >
          👥
        </button>
      </div>

      {selectedName && (
        <div className="po-recipient-selected-name">{selectedName}</div>
      )}

      {open && (
        <div className="po-recipient-dropdown">
          <div className="po-recipient-search-wrap">
            <input
              ref={searchRef}
              type="text"
              className="po-recipient-search-input"
              placeholder="Search by name or number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="po-recipient-list">
            {filtered.length === 0 ? (
              <div className="po-txp-no-results">
                {recipients.length === 0 ? 'No saved contacts yet' : 'No contacts match'}
              </div>
            ) : (
              filtered.map(r => (
                <div key={r.id} className="po-recipient-option" onMouseDown={() => selectRecipient(r)}>
                  <span className="po-ro-name">{r.name}</span>
                  <span className="po-ro-phone">{r.phone}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipientPicker;
