import { Plus } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  id: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  emptyText?: string;
  className?: string;
  /** Pins an "Other / Add ..." row at the end of the list that switches the field to free-text entry -- for fields whose real-world values can't be fully enumerated (e.g. City). */
  allowCustomEntry?: boolean;
  customEntryLabel?: string;
}

/**
 * A searchable single-select combobox: a plain text input that filters a
 * dropdown list as you type. Selecting an option (click, or Enter on the
 * highlighted row) commits `value`; typing something that no longer
 * matches the committed value clears it, so the field can never be
 * submitted holding free text that was never actually selected from the
 * list -- `required` on the underlying input still gates native form
 * validation exactly like a plain text Input.
 *
 * When `allowCustomEntry` is set, a pinned row at the end of the list lets
 * the user opt into typing a value that isn't in `options` at all (e.g. a
 * city missing from the dataset). Selecting it switches the field into
 * plain free-text mode -- every keystroke commits directly, no list
 * matching -- until the field is cleared back to empty, which returns it
 * to normal searching.
 */
export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(
  (
    {
      id,
      options,
      value,
      onChange,
      placeholder,
      disabled,
      required,
      emptyText = "No matches",
      className,
      allowCustomEntry = false,
      customEntryLabel = "Other / Add City",
    },
    ref,
  ) => {
    const [query, setQuery] = React.useState(value);
    const [isOpen, setIsOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);
    // Once true, the field is plain free text (no list matching) -- set by
    // choosing the "Other / Add ..." row, cleared when the value is reset
    // to empty (either by the user or by the parent, e.g. a State change).
    const [isCustomEntry, setIsCustomEntry] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const listboxId = `${id}-listbox`;

    // Keep the visible text in sync when the committed value changes from
    // outside (e.g. the parent clears city when state changes) -- and drop
    // out of custom-entry mode whenever it's cleared externally, so a
    // freshly-enabled field always starts back in normal searching mode.
    React.useEffect(() => {
      setQuery(value);
      if (value === "") setIsCustomEntry(false);
    }, [value]);

    React.useEffect(() => {
      function handlePointerDown(event: PointerEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    const filtered = query.trim()
      ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;
    const optionCount = filtered.length + (allowCustomEntry ? 1 : 0);

    function selectOption(option: ComboboxOption) {
      onChange(option.value);
      setQuery(option.label);
      setIsOpen(false);
    }

    function enterCustomEntry() {
      // Whatever the user had already typed (or nothing) becomes the
      // starting point for free-text entry.
      onChange(query.trim());
      setIsCustomEntry(true);
      setIsOpen(false);
    }

    function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
      const next = event.target.value;
      setQuery(next);
      if (isCustomEntry) {
        onChange(next);
        if (next.trim() === "") {
          // Cleared back to empty -- fall back to normal searching.
          setIsCustomEntry(false);
          setIsOpen(true);
        }
        return;
      }
      setIsOpen(true);
      setHighlightedIndex(0);
      if (value && next !== value) onChange("");
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (isCustomEntry) return; // plain free text -- no list to navigate
      if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
        setIsOpen(true);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, optionCount - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (allowCustomEntry && highlightedIndex === filtered.length) {
          enterCustomEntry();
        } else {
          const option = filtered[highlightedIndex];
          if (option) selectOption(option);
        }
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    return (
      <div ref={containerRef} className="relative">
        <input
          ref={ref}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (!isCustomEntry) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
        {isCustomEntry && (
          <p className="mt-1 text-xs text-muted-foreground">Custom city — not in our list.</p>
        )}
        {isOpen && !disabled && !isCustomEntry && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          >
            {filtered.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">{emptyText}</li>}
            {filtered.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => {
                  // Prevent the input's blur (which would close the list
                  // before the click registers) from firing first.
                  event.preventDefault();
                  selectOption(option);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "cursor-pointer rounded-sm px-2 py-1.5",
                  index === highlightedIndex ? "bg-accent text-accent-foreground" : "",
                  option.value === value ? "font-medium" : "",
                )}
              >
                {option.label}
              </li>
            ))}
            {allowCustomEntry && (
              <li
                role="option"
                aria-selected={false}
                onMouseDown={(event) => {
                  event.preventDefault();
                  enterCustomEntry();
                }}
                onMouseEnter={() => setHighlightedIndex(filtered.length)}
                className={cn(
                  "mt-1 flex cursor-pointer items-center gap-1.5 rounded-sm border-t px-2 py-2 pt-2.5 text-brand",
                  filtered.length === highlightedIndex ? "bg-accent" : "",
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {customEntryLabel}
              </li>
            )}
          </ul>
        )}
      </div>
    );
  },
);
Combobox.displayName = "Combobox";
