import { MapPinIcon } from './ui/icons';

interface LocationSectionProps {
  address: string | null;
  directions: string | null;
}

// Address and (when present) directions from branding, beside a clearly-marked
// placeholder where a map will go later. NO map is integrated here by design.
// Caller renders this only when there is an address.
export function LocationSection({ address, directions }: LocationSectionProps) {
  return (
    <section
      id="location"
      aria-labelledby="location-heading"
      className="scroll-mt-24 bg-cream px-5 py-20 sm:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Find us
          </p>
          <h2
            id="location-heading"
            className="text-3xl font-semibold text-charcoal sm:text-4xl"
          >
            Location
          </h2>
        </header>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            {address ? (
              <div className="flex items-start gap-3">
                <MapPinIcon className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-muted">
                    Address
                  </h3>
                  <p className="mt-1 text-lg text-charcoal">{address}</p>
                </div>
              </div>
            ) : null}

            {directions ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-muted">
                  Getting here
                </h3>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-charcoal-muted">
                  {directions}
                </p>
              </div>
            ) : null}
          </div>

          {/* Placeholder for a future map integration — intentionally not a map. */}
          <div
            aria-hidden="true"
            className="flex min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-sand-border bg-sand/40 text-center"
          >
            <div className="px-6">
              <MapPinIcon className="mx-auto h-8 w-8 text-primary/60" />
              <p className="mt-2 text-sm font-medium text-charcoal-muted">
                Map coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
