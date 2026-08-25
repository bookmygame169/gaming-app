// src/app/cafes/[id]/page.tsx

import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";
import dynamicImport from "next/dynamic";
import Link from "next/link";

// Lazy load heavy components
const CafeGallery = dynamicImport(() => import("@/components/CafeGallery"), {
  loading: () => (
    <div className="px-5 py-6 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/35">
      LOADING PHOTOS…
    </div>
  ),
});

const CafeDetailsAccordion = dynamicImport(() => import("@/components/CafeDetailsAccordion"), {
  loading: () => (
    <div className="px-5 py-6 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/35">
      LOADING DETAILS…
    </div>
  ),
});

const LiveAvailability = dynamicImport(() => import("@/components/LiveAvailability"), {
  loading: () => null,
});

const CafeReviews = dynamicImport(() => import("@/components/CafeReviews"), {
  loading: () => (
    <div className="px-5 py-6 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/35">
      LOADING REVIEWS…
    </div>
  ),
});

type CafePageProps = {
  params: Promise<{ id: string }>;
};

type CafeImageRow = {
  id: string;
  image_url: string;
  cafe_id: string;
};

type PricingRow = {
  console_type: string;
  quantity: number | null;
  duration_minutes: number | null;
  price: number | string | null;
};

/** The kinds of machine a café can hold, and what each is called on screen. */
const CONSOLE_CONFIG: {
  key:
    | "ps5_count"
    | "ps4_count"
    | "xbox_count"
    | "pc_count"
    | "pool_count"
    | "arcade_count"
    | "snooker_count"
    | "steering_wheel_count"
    | "racing_sim_count"
    | "vr_count";
  label: string;
  /** How this kind is named in console_pricing, where the rates live. */
  pricingKey: string;
}[] = [
  { key: "pc_count", label: "PC", pricingKey: "pc" },
  { key: "ps5_count", label: "PS5", pricingKey: "ps5" },
  { key: "ps4_count", label: "PS4", pricingKey: "ps4" },
  { key: "xbox_count", label: "XBOX", pricingKey: "xbox" },
  { key: "vr_count", label: "VR", pricingKey: "vr" },
  { key: "racing_sim_count", label: "RACING SIM", pricingKey: "racing_sim" },
  { key: "steering_wheel_count", label: "STEERING WHEEL", pricingKey: "steering_wheel" },
  { key: "pool_count", label: "POOL", pricingKey: "pool" },
  { key: "snooker_count", label: "SNOOKER", pricingKey: "snooker" },
  { key: "arcade_count", label: "ARCADE", pricingKey: "arcade" },
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * One café, in the BookMyGame Site design.
 *
 * The design's venue screen puts a rate rail down the right-hand side, one row
 * per kind of machine. Those rows are read from console_pricing rather than
 * from the café's single hourly_price, because that is where the real per-hour
 * numbers live and they differ by machine — a PS5 hour is not a PC hour.
 *
 * Two things in the design are missing here on purpose. There is no distance,
 * because no café has coordinates stored, and the seat map with time slots
 * belongs to the booking screen, which is where BOOK A SEAT leads.
 */
export default async function CafePage({ params }: CafePageProps) {
  const { id } = await params;

  if (!id) return <NotFound message="The URL did not contain a valid café id." />;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const { data: cafeRows, error: cafeError } = await supabase
    .from("cafes")
    .select(
      `
      id,
      name,
      slug,
      address,
      description,
      hourly_price,
      google_maps_url,
      cover_url,
      ps5_count,
      ps4_count,
      xbox_count,
      pc_count,
      pool_count,
      arcade_count,
      snooker_count,
      steering_wheel_count,
      racing_sim_count,
      vr_count,
      opening_hours,
      peak_hours,
      popular_games,
      offers,
      monitor_details,
      processor_details,
      gpu_details,
      ram_details,
      accessories_details,
      show_tech_specs
    `
    )
    .eq(isUUID ? "id" : "slug", id)
    .limit(1);

  const cafe = cafeRows?.[0] ?? null;

  if (!cafe || cafeError) {
    return <NotFound message="This café doesn't exist anymore or could not be loaded." />;
  }

  const [{ data: galleryRows }, { data: pricingRows }, { data: planRows }] = await Promise.all([
    supabase.from("cafe_images").select("id, image_url, cafe_id").eq("cafe_id", cafe.id),
    supabase
      .from("console_pricing")
      .select("console_type, quantity, duration_minutes, price")
      .eq("cafe_id", cafe.id),
    supabase
      .from("membership_plans")
      .select("id, name, price, is_unlimited")
      .eq("cafe_id", cafe.id)
      .eq("is_active", true)
      .order("price", { ascending: true }),
  ]);

  const galleryImages =
    (galleryRows as CafeImageRow[] | null)?.map((img) => ({
      id: img.id,
      url: img.image_url,
      alt: `${cafe.name} photo`,
    })) ?? [];

  const mapsUrl =
    cafe.google_maps_url ??
    (cafe.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.address)}`
      : null);

  const availableConsoles = CONSOLE_CONFIG.map((entry) => ({
    ...entry,
    count: (cafe[entry.key as keyof typeof cafe] as number | null) ?? 0,
  })).filter((entry) => entry.count > 0);

  // One hour, one player: the number a customer compares cafés on. Anything
  // else on the price list is a variation of it and belongs on the booking
  // screen, where they are actually choosing.
  const hourlyByType = new Map<string, number>();
  for (const row of (pricingRows ?? []) as PricingRow[]) {
    if (Number(row.duration_minutes) !== 60) continue;
    if (row.quantity != null && Number(row.quantity) !== 1) continue;
    hourlyByType.set(String(row.console_type), Number(row.price) || 0);
  }

  const rates = availableConsoles
    .map((entry) => ({
      label: entry.label,
      count: entry.count,
      price: hourlyByType.get(entry.pricingKey) ?? null,
    }))
    .filter((rate) => rate.price !== null);

  const plans = planRows ?? [];
  const cheapestPlan = plans[0] ?? null;
  const totalSeats = availableConsoles.reduce((sum, entry) => sum + entry.count, 0);
  const bookHref = `/cafes/${cafe.slug || cafe.id}/book`;

  return (
    <main className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
      <div className="flex items-center gap-3.5 border-b border-[#f2f0ea]/[0.12] px-5 py-[22px] font-mono text-xs tracking-[0.18em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
        <Link href="/" className="transition-colors hover:text-[#d8ff3c]">
          ← CAFES
        </Link>
        <span>/</span>
        <span className="truncate text-[#f2f0ea]">{cafe.name?.toUpperCase()}</span>
      </div>

      <section className="grid border-b border-[#f2f0ea]/[0.12] lg:grid-cols-[1.4fr_0.6fr]">
        <div className="border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:border-r lg:p-12">
          <div className="flex items-center gap-3 font-mono text-xs tracking-[0.26em] text-[#d8ff3c]">
            <span className="h-2 w-2 bg-[#d8ff3c]" />
            {cafe.opening_hours ? String(cafe.opening_hours).toUpperCase() : "OPEN TODAY"}
          </div>

          <h1 className="mt-5 text-[clamp(38px,5.4vw,74px)] font-black uppercase leading-[0.92] tracking-[-0.04em]">
            {cafe.name}
          </h1>

          <div className="mt-4 font-mono text-[13px] tracking-[0.14em] text-[#f2f0ea]/45">
            {[cafe.address, totalSeats > 0 ? `${totalSeats} STATIONS` : null]
              .filter(Boolean)
              .join(" · ")
              .toUpperCase()}
          </div>

          {cafe.description && (
            <p className="mt-5 max-w-[600px] font-mono text-[15px] leading-[1.8] text-[#f2f0ea]/50">
              {cafe.description}
            </p>
          )}

          {availableConsoles.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {availableConsoles.map((entry) => (
                <span
                  key={entry.key}
                  className="whitespace-nowrap border border-[#f2f0ea]/[0.14] px-3.5 py-[9px] font-mono text-[11px] tracking-[0.12em] text-[#f2f0ea]/60"
                >
                  {entry.count} {entry.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={bookHref}
              className="bg-[#d8ff3c] px-9 py-[19px] font-display text-[15px] font-black tracking-[0.12em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
            >
              BOOK A SEAT →
            </Link>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#f2f0ea]/20 px-[30px] py-[19px] font-mono text-[13px] font-semibold tracking-[0.18em] text-[#f2f0ea]/70 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
              >
                GET DIRECTIONS
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          {rates.length > 0 ? (
            rates.map((rate) => (
              <div
                key={rate.label}
                className="flex flex-1 items-center justify-between gap-4 border-b border-[#f2f0ea]/10 px-6 py-[22px] sm:px-8"
              >
                <div className="min-w-0">
                  <div className="whitespace-nowrap text-base font-extrabold">{rate.label}</div>
                  <div className="mt-1 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                    {rate.count} AVAILABLE
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="whitespace-nowrap text-2xl font-black tracking-[-0.02em]">
                    ₹{rate.price}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/35">
                    PER HOUR
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-between gap-4 border-b border-[#f2f0ea]/10 px-6 py-[22px] sm:px-8">
              <div className="text-base font-extrabold">FROM</div>
              <div className="text-right">
                <div className="text-2xl font-black tracking-[-0.02em]">
                  ₹{cafe.hourly_price ?? 0}
                </div>
                <div className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/35">
                  PER HOUR
                </div>
              </div>
            </div>
          )}

          {plans.length > 0 && (
            <Link href="/membership" className="bg-[#d8ff3c]/[0.06] px-6 py-6 sm:px-8">
              <div className="font-mono text-[11px] tracking-[0.2em] text-[#d8ff3c]">
                THIS CAFÉ&apos;S MEMBERSHIP
              </div>
              <div className="mt-2.5 text-[19px] font-extrabold leading-[1.3]">
                {cheapestPlan?.is_unlimited
                  ? "Unlimited play, one price"
                  : `Passes from ₹${Number(cheapestPlan?.price ?? 0).toLocaleString("en-IN")}`}
              </div>
              <div className="mt-2 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/45">
                SEE {plans.length} PLAN{plans.length === 1 ? "" : "S"} →
              </div>
            </Link>
          )}
        </div>
      </section>

      {cafe.cover_url && (
        <div className="relative h-[240px] w-full border-b border-[#f2f0ea]/[0.12] sm:h-[360px]">
          <Image
            src={cafe.cover_url}
            alt={cafe.name}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      <section className="border-b border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:px-12">
        <div className="flex items-baseline gap-[18px]">
          <h2 className="m-0 text-[clamp(24px,3vw,32px)] font-black uppercase tracking-[-0.02em]">
            Free right now
          </h2>
          <span className="h-px flex-1 bg-[#f2f0ea]/[0.12]" />
        </div>
        <div className="mt-5">
          <LiveAvailability cafeId={cafe.id} />
        </div>
        <Link
          href={bookHref}
          className="mt-7 inline-block bg-[#d8ff3c] px-9 py-[19px] font-display text-[15px] font-black tracking-[0.12em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
        >
          BOOK A SEAT →
        </Link>
      </section>

      <section className="border-b border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:px-12">
        <CafeDetailsAccordion
          opening_hours={cafe.opening_hours}
          peak_hours={cafe.peak_hours}
          popular_games={cafe.popular_games}
          offers={cafe.offers}
          monitor_details={cafe.monitor_details}
          processor_details={cafe.processor_details}
          gpu_details={cafe.gpu_details}
          ram_details={cafe.ram_details}
          accessories_details={cafe.accessories_details}
          show_tech_specs={cafe.show_tech_specs ?? true}
        />
      </section>

      <section className="border-b border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:px-12">
        <div className="flex items-baseline gap-[18px] pb-6">
          <h2 className="m-0 text-[clamp(24px,3vw,32px)] font-black uppercase tracking-[-0.02em]">
            What people say
          </h2>
          <span className="h-px flex-1 bg-[#f2f0ea]/[0.12]" />
        </div>
        <CafeReviews cafeId={cafe.id} />
      </section>

      {galleryImages.length > 0 && (
        <section className="border-b border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:px-12">
          <div className="flex items-baseline gap-[18px] pb-6">
            <h2 className="m-0 text-[clamp(24px,3vw,32px)] font-black uppercase tracking-[-0.02em]">
              The place
            </h2>
            <span className="h-px flex-1 bg-[#f2f0ea]/[0.12]" />
          </div>
          <CafeGallery images={galleryImages} />
        </section>
      )}

      {cafe.address && (
        <section className="flex flex-wrap items-center justify-between gap-6 px-5 py-10 sm:px-8 lg:px-12">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
              WHERE IT IS
            </div>
            <div className="mt-3 max-w-[46ch] text-lg font-extrabold leading-[1.4]">
              {cafe.address}
            </div>
          </div>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#d8ff3c] px-7 py-4 font-mono text-xs font-semibold tracking-[0.2em] text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c] hover:text-[#0b0b0c]"
            >
              OPEN IN MAPS
            </a>
          )}
        </section>
      )}
    </main>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#0b0b0c] px-5 py-16 font-display text-[#f2f0ea] sm:px-8 lg:px-12">
      <div className="font-mono text-xs tracking-[0.28em] text-[#ff5c2b]">NOT FOUND</div>
      <h1 className="mt-5 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">
        Café not found
      </h1>
      <p className="mt-5 max-w-[46ch] font-mono text-[13px] leading-[1.9] text-[#f2f0ea]/45">
        {message}
      </p>
      <Link
        href="/"
        className="mt-8 inline-block bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
      >
        BROWSE CAFÉS →
      </Link>
    </main>
  );
}
