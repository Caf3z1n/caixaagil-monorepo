"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type PlatformSelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  leading?: ReactNode;
};

type PlatformSelectProps<T extends string> = {
  value: T;
  options: readonly PlatformSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptySearchLabel?: string;
  name?: string;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function PlatformSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  emptySearchLabel = "Nenhum item encontrado",
  name,
  placeholder = "Selecione",
  searchable = false,
  searchPlaceholder = "Buscar"
}: PlatformSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const buttonId = useId();
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<T | null>(value);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedOption = useMemo(
    () => options.find(option => option.value === value),
    [options, value]
  );
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  const visibleOptions = useMemo(() => {
    if (!searchable || !normalizedSearchTerm) {
      return options;
    }

    return options.filter(option => {
      const searchText = normalizeSearchText(
        [option.label, option.description, option.value].filter(Boolean).join(" ")
      );

      return searchText.includes(normalizedSearchTerm);
    });
  }, [normalizedSearchTerm, options, searchable]);
  const enabledOptions = useMemo(
    () => visibleOptions.filter(option => !option.disabled),
    [visibleOptions]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedEnabledOption = enabledOptions.find(option => option.value === value);
    setHighlightedValue(selectedEnabledOption?.value ?? enabledOptions[0]?.value ?? null);
  }, [enabledOptions, isOpen, value]);

  useEffect(() => {
    if (!isOpen && searchTerm) {
      setSearchTerm("");
    }
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (!isOpen || !searchable) {
      return;
    }

    const timeoutId = window.setTimeout(() => searchInputRef.current?.focus(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, searchable]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function getOptionId(optionValue: T) {
    return `${listboxId}-${optionValue}`;
  }

  function moveHighlight(direction: 1 | -1) {
    if (!enabledOptions.length) {
      return;
    }

    setHighlightedValue(currentValue => {
      const currentIndex = enabledOptions.findIndex(
        option => option.value === (currentValue ?? value)
      );
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;

      return enabledOptions[nextIndex].value;
    });
  }

  function selectOption(nextValue: T) {
    const option = options.find(item => item.value === nextValue);

    if (!option || option.disabled) {
      return;
    }

    onChange(nextValue);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (
      searchable &&
      event.key.length === 1 &&
      event.key !== " " &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      setSearchTerm(event.key);
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      moveHighlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      if (highlightedValue) {
        selectOption(highlightedValue);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (highlightedValue) {
        selectOption(highlightedValue);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
  }

  const rootClassName = ["platform-select", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName} data-open={isOpen ? "true" : undefined} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}

      <button
        aria-activedescendant={isOpen && highlightedValue ? getOptionId(highlightedValue) : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="platform-select-control"
        disabled={disabled}
        id={buttonId}
        onClick={() => setIsOpen(current => !current)}
        onKeyDown={handleKeyDown}
        role="combobox"
        type="button"
      >
        <span className="platform-select-value">
          {selectedOption?.leading ? (
            <span className="platform-select-leading" aria-hidden="true">
              {selectedOption.leading}
            </span>
          ) : null}
          <span className="platform-select-value-copy">{selectedOption?.label ?? placeholder}</span>
        </span>
        <ChevronDown aria-hidden="true" className="platform-select-chevron" size={17} />
      </button>

      {isOpen ? (
        <div className="platform-select-menu" data-searchable={searchable ? "true" : undefined}>
          {searchable ? (
            <label className="platform-select-search">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label={searchPlaceholder}
                autoComplete="off"
                placeholder={searchPlaceholder}
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={event => setSearchTerm(event.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </label>
          ) : null}

          <div aria-label={ariaLabel} className="platform-select-list" id={listboxId} role="listbox">
            {visibleOptions.length ? (
              visibleOptions.map(option => {
                const isSelected = option.value === value;
                const isHighlighted = option.value === highlightedValue;

                return (
                  <button
                    aria-selected={isSelected}
                    className="platform-select-option"
                    data-highlighted={isHighlighted ? "true" : undefined}
                    data-selected={isSelected ? "true" : undefined}
                    disabled={option.disabled}
                    id={getOptionId(option.value)}
                    key={option.value}
                    onClick={() => selectOption(option.value)}
                    onMouseEnter={() => setHighlightedValue(option.value)}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="platform-select-option-main">
                      {option.leading ? (
                        <span className="platform-select-leading" aria-hidden="true">
                          {option.leading}
                        </span>
                      ) : null}
                      <span className="platform-select-option-copy">
                        <span>{option.label}</span>
                        {option.description ? <em>{option.description}</em> : null}
                      </span>
                    </span>

                    {isSelected ? <Check aria-hidden="true" className="platform-select-check-icon" size={16} /> : null}
                  </button>
                );
              })
            ) : (
              <span className="platform-select-empty">{emptySearchLabel}</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
