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
}: SearchableSelectProps) {
  const [isOpen, setIsOpen]   = useState(false);
  const [search, setSearch]   = useState('');
  const containerRef          = useRef<HTMLDivElement>(null);
  const searchRef             = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = options.filter(
    (o) =>
      search === '' ||
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
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
      setSearch('');
    }
  }

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <div
        onClick={() => { if (!disabled) setIsOpen((prev) => !prev); }}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0.375rem 0.75rem',
          fontSize:       '1rem',
          fontWeight:     400,
          lineHeight:     1.5,
          color:          selected ? '#1A1A1A' : '#6c757d',
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
          {selected ? selected.label : placeholder}
        </span>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d', fontSize: '0.875rem' }}>
                <Spinner size="sm" className="me-2" />
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d', fontSize: '0.875rem' }}>
                No results found
              </div>
            ) : (
              filtered.map((option) => (
                <div
                  key={option.value}
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
        </div>
      )}
    </div>
  );
}
