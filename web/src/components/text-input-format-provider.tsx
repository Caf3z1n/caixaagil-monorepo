"use client";

import { useEffect } from "react";

import { capitalizeFirstTextLetter } from "@/lib/text-format";

function isPasswordInput(input: HTMLInputElement) {
  const passwordHints = [
    input.type,
    input.autocomplete,
    input.id,
    input.name,
    input.placeholder,
    input.getAttribute("aria-label") ?? ""
  ]
    .join(" ")
    .toLocaleLowerCase("pt-BR");

  return passwordHints.includes("password") || passwordHints.includes("senha");
}

function shouldFormatInput(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  const type = target.type.toLocaleLowerCase("pt-BR");

  if (type !== "text") {
    return false;
  }

  if (target.inputMode || target.readOnly || target.disabled || isPasswordInput(target)) {
    return false;
  }

  if (target.classList.contains("text-transform-none") || target.classList.contains("text-uppercase-input")) {
    return false;
  }

  return !target.closest(
    ".product-search-field, .fiscal-search, .cash-conference-search, .product-input-with-icon, .stock-operation-search, .stock-product-picker-search"
  );
}

function formatInputValue(input: HTMLInputElement) {
  const nextValue = capitalizeFirstTextLetter(input.value);

  if (nextValue === input.value) {
    return;
  }

  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;

  input.value = nextValue;

  if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

export function TextInputFormatProvider() {
  useEffect(() => {
    function handleInput(event: Event) {
      if (event instanceof InputEvent && event.isComposing) {
        return;
      }

      if (!shouldFormatInput(event.target)) {
        return;
      }

      formatInputValue(event.target);
    }

    document.addEventListener("input", handleInput, true);

    return () => {
      document.removeEventListener("input", handleInput, true);
    };
  }, []);

  return null;
}
