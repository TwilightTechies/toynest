"use client";

import { useEffect, useState } from "react";

// Thumbnails for ProductGallery. Without JS they are #photo-N anchor links that jump to the slide.
// With JS they scroll the track sideways only (an anchor jump would also scroll the page), and follow
// swipes so the current photo is marked with aria-current.
export function GalleryThumbs({ images }: { images: { small: string; alt: string }[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const track = document.getElementById("gallery-track");
    if (!track) return;
    const onScroll = () => setCurrent(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)));
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  function show(index: number, event: React.MouseEvent) {
    const track = document.getElementById("gallery-track");
    if (!track) return;
    event.preventDefault();
    track.scrollTo({ left: index * track.clientWidth });
    setCurrent(index);
  }

  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
      {images.map((image, index) => (
        <li key={image.small} className="shrink-0">
          <a
            href={`#photo-${index + 1}`}
            onClick={(event) => show(index, event)}
            aria-current={index === current ? "true" : undefined}
            aria-label={`Photo ${index + 1} of ${images.length}: ${image.alt}`}
            // 64 px squares: comfortably above the 44 px tap-target minimum.
            className="block h-16 w-16 overflow-hidden rounded-xl border-2 border-border bg-surface aria-[current=true]:border-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized at upload (ADR-017) */}
            <img src={image.small} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}
