"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type HeroProductStory = {
  image: string;
  width: number;
  height: number;
  label: string;
};

type HeroProductStoriesProps = {
  items: readonly HeroProductStory[];
};

const STORY_DURATION_MS = 5000;
const STORY_EXIT_DURATION_MS = 680;

export function HeroProductStories({ items }: HeroProductStoriesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);

  useEffect(() => {
    if (items.length <= 1) {
      setStoryProgress(1);
      return;
    }

    let frameId = 0;
    const startedAt = window.performance.now();

    setStoryProgress(0);

    function updateProgress(now: number) {
      const nextProgress = Math.min((now - startedAt) / STORY_DURATION_MS, 1);

      setStoryProgress(nextProgress);

      if (nextProgress >= 1) {
        setActiveIndex((currentIndex) => {
          setPreviousIndex(currentIndex);
          return (currentIndex + 1) % items.length;
        });
        return;
      }

      frameId = window.requestAnimationFrame(updateProgress);
    }

    frameId = window.requestAnimationFrame(updateProgress);

    return () => window.cancelAnimationFrame(frameId);
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (previousIndex === null) {
      return;
    }

    const exitTimer = window.setTimeout(() => {
      setPreviousIndex(null);
    }, STORY_EXIT_DURATION_MS);

    return () => window.clearTimeout(exitTimer);
  }, [previousIndex]);

  return (
    <div className="hero-product-carousel" data-active-story={activeIndex}>
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        const isExiting = index === previousIndex && index !== activeIndex;

        return (
          <figure
            className={[
              "hero-product-slide",
              isActive ? "hero-product-slide-active" : null,
              isExiting ? "hero-product-slide-exit" : null
            ].filter(Boolean).join(" ")}
            key={item.label}
          >
            <Image
              className="hero-product-image"
              src={item.image}
              alt=""
              width={item.width}
              height={item.height}
              priority={index === 0}
              sizes="(max-width: 820px) 92vw, 760px"
            />
            <span className="hero-product-divider" />
            <figcaption className="hero-product-caption">
              <span className="hero-product-step">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="hero-product-name">{item.label}</span>
            </figcaption>
          </figure>
        );
      })}

      <div className="hero-product-progress">
        {items.map((item, index) => {
          const progressValue = index < activeIndex ? 1 : index === activeIndex ? storyProgress : 0;

          return (
            <span
              className={
                index === activeIndex
                  ? "hero-product-progress-item hero-product-progress-active"
                  : index < activeIndex
                    ? "hero-product-progress-item hero-product-progress-done"
                    : "hero-product-progress-item"
              }
              key={item.label}
            >
              <i
                aria-hidden="true"
                className="hero-product-progress-fill"
                style={{ transform: `scaleX(${progressValue})` }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
