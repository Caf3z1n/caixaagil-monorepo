"use client";

import { useEffect, useMemo, useState } from "react";

type TypewriterHeadingProps = {
  id: string;
  phrases: string[];
  delayMs?: number;
  holdMs?: number;
  stepMs?: number;
  deleteStepMs?: number;
};

export function TypewriterHeading({
  id,
  phrases,
  delayMs = 520,
  holdMs = 5000,
  stepMs = 62,
  deleteStepMs = 26
}: TypewriterHeadingProps) {
  const safePhrases = useMemo(
    () => (phrases.length > 0 ? phrases : [""]),
    [phrases]
  );
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const currentPhrase = safePhrases[phraseIndex] ?? safePhrases[0] ?? "";
  const isComplete = visibleChars >= currentPhrase.length;

  useEffect(() => {
    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const nextDelay = (typedChar: string) => {
      if (typedChar === ",") {
        return 560;
      }

      if (typedChar === ".") {
        return 300;
      }

      if (typedChar === " ") {
        return 35;
      }

      return stepMs;
    };

    const run = async () => {
      await wait(delayMs);

      let nextPhraseIndex = 0;

      while (!isCancelled) {
        const phrase = safePhrases[nextPhraseIndex] ?? "";

        setPhraseIndex(nextPhraseIndex);
        setVisibleChars(0);

        for (let index = 1; index <= phrase.length && !isCancelled; index += 1) {
          setVisibleChars(index);
          await wait(nextDelay(phrase[index - 1] ?? ""));
        }

        await wait(holdMs);

        for (
          let index = phrase.length - 1;
          index >= 0 && !isCancelled;
          index -= 1
        ) {
          setVisibleChars(index);
          await wait(deleteStepMs);
        }

        nextPhraseIndex = (nextPhraseIndex + 1) % safePhrases.length;
        await wait(260);
      }
    };

    run();

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [delayMs, deleteStepMs, holdMs, safePhrases, stepMs]);

  return (
    <h1
      id={id}
      className="typewriter-heading"
      aria-label={currentPhrase}
      data-complete={isComplete ? "true" : "false"}
    >
      {safePhrases.map((phrase) => (
        <span className="typewriter-measure" aria-hidden="true" key={phrase}>
          {phrase}
        </span>
      ))}
      <span className="typewriter-text" aria-hidden="true">
        {currentPhrase.slice(0, visibleChars)}
        <span className="typewriter-caret" />
      </span>
    </h1>
  );
}
