"use client";

import { useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqAccordionProps = {
  items: readonly FaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="faq-list">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const contentId = `faq-answer-${index}`;

        return (
          <article className={isOpen ? "faq-item faq-item-open" : "faq-item"} key={item.question}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={contentId}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span className="faq-plus" aria-hidden="true" />
              <span>{item.question}</span>
            </button>
            <div className="faq-answer" id={contentId} aria-hidden={!isOpen}>
              <p>{item.answer}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
