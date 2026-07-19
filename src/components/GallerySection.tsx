import { useState } from 'react';
import { Lightbox } from './Lightbox';

interface GallerySectionProps {
  images: string[];
  hotelName: string;
}

// Responsive image grid from branding.gallery_images, each thumbnail a button
// that opens the lightbox at that image. Caller renders this only when there is
// at least one gallery image.
export function GallerySection({ images, hotelName }: GallerySectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="gallery"
      aria-labelledby="gallery-heading"
      className="scroll-mt-24 bg-sand/40 px-5 py-20 sm:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Gallery
          </p>
          <h2
            id="gallery-heading"
            className="text-3xl font-semibold text-charcoal sm:text-4xl"
          >
            A look around
          </h2>
        </header>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={`Open image ${i + 1} of ${images.length}`}
                className="group block aspect-square w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                <img
                  src={src}
                  alt={`${hotelName} — photo ${i + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {openIndex !== null ? (
        <Lightbox
          images={images}
          startIndex={openIndex}
          hotelName={hotelName}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </section>
  );
}
