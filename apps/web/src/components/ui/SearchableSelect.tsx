import { useState, useRef, useEffect } from 'react';
import { Form, Spinner } from 'react-bootstrap';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options:           SearchableSelectOption[];
  value:             string;
  onChange:          (value: string) => void;
  placeholder?:      string;
  searchPlaceholder?: string;
  isLoading?:        boolean;
  disabled?:         boolean;
  isInvalid?:        boolean;
  /**
   * Server-side search. When given, `options` are taken to be the results for
   * the current term and are not filtered again here — the term is handed to
   * the caller to query with. Without it, the options are filtered locally.
   */
  onSearchChange?:   (term: string) => void;
  /**
   * Label for the current value when it is not among `options`. A server search
   * moves on past the chosen item, and without this its name would vanish from
   * the field while it is still selected.
   */
  selectedLabel?:    string;
  /** Adds a ✕ that clears the value. */
  clearable?:        boolean;
  /** Shown when there are no options. */
  emptyText?:        string;
  /** Rendered beneath the options — e.g. a hint that more results exist. */
  footer?:           React.ReactNode;
  /**
   * Accessible name for the field. The visible Form.Label is not linked to this
   * div, so without it a screen reader announces only the current selection.
   */
  ariaLabel?:        string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  isLoading = false,
  disabled = false,
  isInvalid = false,
  onSearchChange,
  selectedLabel,
  clearable = false,
  emptyText = 'No results found',
  footer,
  ariaLabel,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen]   = useState(false);
  const [search, setSearch]   = useState('');
  const containerRef          = useRef<HTMLDivElement>(null);
  const searchRef             = useRef<HTMLInputElement>(null);

  // The outside-click listener is registered once, so it reads the latest
  // callback through a ref rather than the one from the first render.
  const onSearchRef = useRef(onSearchChange);
  onSearchRef.current = onSearchChange;

  const updateSearch = (term: string) => {
    setSearch(term);
    onSearchRef.current?.(term);
  };

  const selected     = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? (value ? selectedLabel : undefined);

  const filtered = onSearchChange
    ? options
    : options.filter(
        (o) =>
          search === '' ||
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()),
      );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen((open) => {
          if (open) {
            setSearch('');
            onSearchRef.current?.('');
          }
          return false;
        });
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search when opened
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      updateSearch('');
    }
  }

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setIsOpen(false);
    updateSearch('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <div
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        onClick={() => { if (!disabled) setIsOpen((prev) => !prev); }}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0.375rem 0.75rem',
          fontSize:       '1rem',
          fontWeight:     400,
          lineHeight:     1.5,
          color:          displayLabel ? '#1A1A1A' : '#6c757d',
          background:     disabled ? '#e9ecef' : '#fff',
          border:         `1px solid ${isInvalid ? '#dc3545' : isOpen ? '#86b7fe' : '#ced4da'}`,
          borderRadius:   '0.375rem',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          userSelect:     'none',
          minHeight:      '38px',
          boxShadow:      isOpen ? '0 0 0 0.25rem rgba(13,110,253,0.25)' : 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayLabel ?? placeholder}
        </span>
        {clearable && value && !disabled && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={(e) => {
              // Clearing must not also toggle the dropdown open.
              e.stopPropagation();
              onChange('');
              setIsOpen(false);
              updateSearch('');
            }}
            style={{
              background: 'none', border: 'none', color: '#6c757d', cursor: 'pointer',
              fontSize: '0.9rem', lineHeight: 1, padding: '0 6px', flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
        <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#6c757d', flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          style={{
            position:      'absolute',
            top:           'calc(100% + 2px)',
            left:          0,
            right:         0,
            background:    '#fff',
            border:        '1px solid #ced4da',
            borderRadius:  '0.375rem',
            boxShadow:     '0 4px 12px rgba(0,0,0,0.15)',
            zIndex:        1050,
            maxHeight:     '280px',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}
        >
          {/* Search input inside dropdown */}
          <div style={{ padding: '8px', borderBottom: '1px solid #e9ecef', flexShrink: 0 }}>
            <Form.Control
              ref={searchRef}
              type="text"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              size="sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options list */}
          <div role="listbox" style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d', fontSize: '0.875rem' }}>
                <Spinner size="sm" className="me-2" />
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d', fontSize: '0.875rem' }}>
                {emptyText}
              </div>
            ) : (
              filtered.map((option) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option.value)}
                  style={{
                    padding:    '8px 12px',
                    cursor:     'pointer',
                    background: option.value === value ? '#e8f4fd' : 'transparent',
                    borderLeft: option.value === value ? '3px solid #0F7B6C' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (option.value !== value) {
                      (e.currentTarget as HTMLDivElement).style.background = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (option.value !== value) {
                      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ fontSize: '0.9rem', fontWeight: option.value === value ? 600 : 400, color: '#1A1A1A' }}>
                    {option.label}
                  </div>
                  {option.sublabel && (
                    <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '1px' }}>
                      {option.sublabel}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {footer && !isLoading && filtered.length > 0 && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid #e9ecef', flexShrink: 0 }}>
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
