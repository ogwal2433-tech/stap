import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect';

/**
 * Two modes. Without onSearchChange the options are filtered here — how its
 * seven existing callers use it, and that must not change. With it, the caller
 * searches the server and the options are already the results.
 */

const OPTIONS: SearchableSelectOption[] = [
  { value: 'a', label: 'Acacia Mall',    sublabel: 'SSLC001' },
  { value: 'b', label: 'Bugolobi Flats', sublabel: 'SSLC002' },
  { value: 'c', label: 'Centenary Bank', sublabel: 'SSLC003' },
];

function Harness({
  initial, onChange, ...rest
}: Partial<React.ComponentProps<typeof SearchableSelect>> & { initial?: string }) {
  const [value, setValue] = useState(initial ?? '');
  return (
    <SearchableSelect
      options={OPTIONS}
      placeholder="Pick one"
      searchPlaceholder="Search options"
      {...rest}
      // After the spread, so a spy passed as onChange observes changes rather
      // than replacing the state update that makes them.
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
    />
  );
}

const open   = () => fireEvent.click(screen.getByRole('combobox'));
const typeIn = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText('Search options'), { target: { value: text } });

describe('local filtering — the existing behaviour', () => {
  it('filters the given options by label and sublabel', () => {
    render(<Harness />);
    open();
    typeIn('bug');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Bugolobi FlatsSSLC002']);

    typeIn('sslc003');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Centenary Bank')).toBeInTheDocument();
  });

  it('selects, closes and shows the choice', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('option', { name: /Acacia Mall/ }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Acacia Mall');
  });
});

describe('server search — onSearchChange', () => {
  it('hands the term to the caller and does not filter the options again', () => {
    const onSearchChange = vi.fn();
    render(<Harness onSearchChange={onSearchChange} />);
    open();
    typeIn('zzz');

    expect(onSearchChange).toHaveBeenLastCalledWith('zzz');
    // "zzz" matches nothing locally, but these are the server's results for it.
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('resets the term when a choice is made', () => {
    const onSearchChange = vi.fn();
    render(<Harness onSearchChange={onSearchChange} />);
    open();
    typeIn('cent');
    fireEvent.click(screen.getByRole('option', { name: /Centenary Bank/ }));

    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });

  it('keeps showing the chosen label after the search has moved past it', () => {
    render(<Harness options={[]} initial="gone" selectedLabel="Zeta Security Ltd" onSearchChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Zeta Security Ltd');
  });

  it('shows the caller\'s empty text and footer', () => {
    const { rerender } = render(
      <Harness options={[]} onSearchChange={() => {}} emptyText='No clients match "xyz"' />,
    );
    open();
    expect(screen.getByText('No clients match "xyz"')).toBeInTheDocument();

    rerender(<Harness onSearchChange={() => {}} footer={<span>Keep typing</span>} />);
    expect(screen.getByText('Keep typing')).toBeInTheDocument();
  });
});

describe('clearing', () => {
  it('clears the value without opening the dropdown', () => {
    const onChange = vi.fn();
    render(<Harness initial="b" clearable onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('offers no clear button when nothing is selected', () => {
    render(<Harness clearable />);
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  });

  it('offers no clear button when not clearable, even with a value', () => {
    // A separate mount: `initial` only seeds state on first render, so a
    // rerender would not actually give the field a value.
    render(<Harness initial="a" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Acacia Mall');
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  });
});
