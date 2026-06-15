"use client";

import { Check, ChevronDown } from "lucide-react";
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
  name?: string;
  placeholder?: string;
};

export function PlatformSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  name,
  placeholder = "Selecione"
}: PlatformSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<T | null>(value);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value),
    [options, value]
  );
  const enabledOptions = useMemo(
    () => options.filter(option => !option.disabled),
    [options]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedValue(value || enabledOptions[0]?.value || null);
  }, [enabledOptions, isOpen, value]);

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
        <div
          aria-label={ariaLabel}
          className="platform-select-menu"
          id={listboxId}
          role="listbox"
        >
          {options.map(option => {
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
          })}
        </div>
      ) : null}
    </div>
  );
}
