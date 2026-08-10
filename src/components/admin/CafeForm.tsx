// src/components/admin/CafeForm.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  uploadAdminImage,
  addAdminCafeImage,
  removeAdminCafeImage,
} from "@/lib/adminUploads";
import { CafeRow } from "@/types/database";

type CafeFormProps = {
  mode: "create" | "edit";
  cafe?: Partial<CafeRow>; // when editing we pass the existing row
};

type GalleryImage = {
  id: string;
  url: string;
};

export default function CafeForm({ mode, cafe }: CafeFormProps) {
  const router = useRouter();

  // ───── Basic info ─────
  const [name, setName] = useState<string>(cafe?.name ?? "");
  const [address, setAddress] = useState<string>(cafe?.address ?? "");
  const [mapsUrl, setMapsUrl] = useState<string>(cafe?.google_maps_url ?? "");
  const [description, setDescription] = useState<string>(
    cafe?.description ?? ""
  );
  const [hourlyPrice, setHourlyPrice] = useState<string>(
    cafe?.hourly_price?.toString() ?? ""
  );

  // ───── Cover image ─────
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    cafe?.cover_url ?? null
  );
  const [coverRemoved, setCoverRemoved] = useState(false);

  // ───── Gallery images ─────
  const [existingGallery, setExistingGallery] = useState<GalleryImage[]>([]);
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ───── Console / device counts ─────
  const [ps5Count, setPs5Count] = useState<string>(
    cafe?.ps5_count?.toString() ?? "0"
  );
  const [ps4Count, setPs4Count] = useState<string>(
    cafe?.ps4_count?.toString() ?? "0"
  );
  const [xboxCount, setXboxCount] = useState<string>(
    cafe?.xbox_count?.toString() ?? "0"
  );
  const [pcCount, setPcCount] = useState<string>(
    cafe?.pc_count?.toString() ?? "0"
  );
  const [poolCount, setPoolCount] = useState<string>(
    cafe?.pool_count?.toString() ?? "0"
  );
  const [arcadeCount, setArcadeCount] = useState<string>(
    cafe?.arcade_count?.toString() ?? "0"
  );

  // NEW: snooker, steering wheel, VR
  const [snookerCount, setSnookerCount] = useState<string>(
    cafe?.snooker_count?.toString() ?? "0"
  );
  const [wheelCount, setWheelCount] = useState<string>(
    cafe?.steering_wheel_count?.toString() ?? "0"
  );
  const [racingSimCount, setRacingSimCount] = useState<string>(
    (cafe as any)?.racing_sim_count?.toString() ?? "0"
  );
  const [vrCount, setVrCount] = useState<string>(
    cafe?.vr_count?.toString() ?? "0"
  );

  // ───── Café details (accordion #1) ─────
  const [detailsOpeningHours, setDetailsOpeningHours] = useState<string>(
    cafe?.opening_hours ?? ""
  );
  const [detailsPeakHours, setDetailsPeakHours] = useState<string>(
    cafe?.peak_hours ?? ""
  );
  const [detailsPopularGames, setDetailsPopularGames] = useState<string>(
    cafe?.popular_games ?? ""
  );
  const [detailsOffers, setDetailsOffers] = useState<string>(
    cafe?.offers ?? ""
  );

  // ───── Device specs (accordion #2) ─────
  const [specMonitor, setSpecMonitor] = useState<string>(
    cafe?.monitor_details ?? ""
  );
  const [specProcessor, setSpecProcessor] = useState<string>(
    cafe?.processor_details ?? ""
  );
  const [specGpu, setSpecGpu] = useState<string>(cafe?.gpu_details ?? "");
  const [specRam, setSpecRam] = useState<string>(cafe?.ram_details ?? "");
  const [specAccessories, setSpecAccessories] = useState<string>(
    cafe?.accessories_details ?? ""
  );

  // ────────────────────────────────────────────────
  // Load existing gallery when in edit mode
  // ────────────────────────────────────────────────
  useEffect(() => {
    async function loadGallery() {
      if (mode !== "edit" || !cafe?.id) return;

      const res = await fetch(
        `/api/admin/cafe-images?cafeId=${encodeURIComponent(cafe.id)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(data.images)) {
        setExistingGallery(
          data.images.map((row: { id: string; image_url: string }) => ({
            id: row.id,
            url: row.image_url,
          }))
        );
      }
    }

    loadGallery();
  }, [mode, cafe?.id]);

  // ────────────────────────────────────────────────
  // Helper: upload cover image (if any)
  // ────────────────────────────────────────────────
  async function uploadCoverIfNeeded(existingUrl?: string | null) {
    if (coverRemoved && !coverFile) {
      return null;
    }

    if (!coverFile) return existingUrl ?? null;

    // Through this origin: the direct Storage call is blocked on the cafés'
    // ISP, which is where cafés are usually onboarded from.
    const { url } = await uploadAdminImage(coverFile, "cover");
    return url;
  }

  // ────────────────────────────────────────────────
  // Helper: upload new gallery files
  // ────────────────────────────────────────────────
  async function uploadGalleryFiles(cafeId: string) {
    if (!newGalleryFiles.length) return;

    const uploads = newGalleryFiles.map(async (file) => {
      const { url } = await uploadAdminImage(file, "gallery", cafeId);
      const image = await addAdminCafeImage(cafeId, url);

      return { id: image.id, url };
    });

    const inserted = await Promise.all(uploads);
    setExistingGallery((prev) => [...prev, ...inserted]);
    setNewGalleryFiles([]);
  }

  // ────────────────────────────────────────────────
  // Helper: delete a gallery image row
  // ────────────────────────────────────────────────
  async function handleDeleteGalleryImage(id: string) {
    try {
      await removeAdminCafeImage(id);

      setExistingGallery((prev) => prev.filter((img) => img.id !== id));
    } catch (err) {
      console.error("[delete gallery image]", err);
      alert("Failed to delete image. Please try again.");
    }
  }

  // ────────────────────────────────────────────────
  // Submit handler
  // ────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      // 1) upload / remove / keep cover
      const newCoverUrl = await uploadCoverIfNeeded(cafe?.cover_url);

      // 2) payload
      const payload: Partial<CafeRow> = {
        name,
        address,
        google_maps_url: mapsUrl || null,
        description: description || null,
        hourly_price: hourlyPrice ? Number(hourlyPrice) : 0,
        cover_url: newCoverUrl,

        ps5_count: ps5Count ? Number(ps5Count) : 0,
        ps4_count: ps4Count ? Number(ps4Count) : 0,
        xbox_count: xboxCount ? Number(xboxCount) : 0,
        pc_count: pcCount ? Number(pcCount) : 0,
        pool_count: poolCount ? Number(poolCount) : 0,
        arcade_count: arcadeCount ? Number(arcadeCount) : 0,

        // NEW fields
        snooker_count: snookerCount ? Number(snookerCount) : 0,
        steering_wheel_count: wheelCount ? Number(wheelCount) : 0,
        racing_sim_count: racingSimCount ? Number(racingSimCount) : 0,
        vr_count: vrCount ? Number(vrCount) : 0,

        opening_hours: detailsOpeningHours || null,
        peak_hours: detailsPeakHours || null,
        popular_games: detailsPopularGames || null,
        offers: detailsOffers || null,

        monitor_details: specMonitor || null,
        processor_details: specProcessor || null,
        gpu_details: specGpu || null,
        ram_details: specRam || null,
        accessories_details: specAccessories || null,
      };

      let result;
      if (mode === "create") {
        result = await supabase.from("cafes").insert(payload).select().single();
      } else {
        if (!cafe?.id) {
          throw new Error("Cafe ID is required for update");
        }
        result = await supabase
          .from("cafes")
          .update(payload)
          .eq("id", cafe.id)
          .select()
          .single();
      }

      if (result.error) {
        throw new Error(result.error.message);
      }

      const created = result.data;
      const cafeId = created.id as string;

      // 3) upload new gallery images if any
      if (newGalleryFiles.length) {
        await uploadGalleryFiles(cafeId);
      }

      router.push(`/cafes/${cafeId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setErrorMsg((err instanceof Error ? err.message : String(err)) || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
    >
      <h1 className="text-lg font-semibold md:text-xl">
        {mode === "create" ? "Create café" : "Edit café"}
      </h1>

      {errorMsg && (
        <p className="rounded-xl bg-red-900/40 px-3 py-2 text-xs text-red-200">
          {errorMsg}
        </p>
      )}

      {/* Basic info */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-300">
            Name
          </label>
          <input
            className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300">
            Google Maps URL (directions)
          </label>
          <input
            className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300">
            Address
          </label>
          <input
            className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300">
            Description
          </label>
          <textarea
            className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300">
            Hourly price (₹)
          </label>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
            value={hourlyPrice}
            onChange={(e) => setHourlyPrice(e.target.value)}
          />
        </div>

        {/* Cover image + preview + remove */}
        <div>
          <label className="block text-xs font-medium text-gray-300">
            Cover image (wide banner)
          </label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 block text-xs text-gray-400"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setCoverFile(file);
              if (file) {
                setCoverPreviewUrl(URL.createObjectURL(file));
                setCoverRemoved(false);
              }
            }}
          />

          {coverPreviewUrl && (
            <div className="mt-3 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverPreviewUrl}
                alt="Cover preview"
                className="h-32 w-full rounded-xl object-cover md:h-40"
              />
              <button
                type="button"
                className="text-[11px] text-red-300 underline underline-offset-2"
                onClick={() => {
                  setCoverFile(null);
                  setCoverPreviewUrl(null);
                  setCoverRemoved(true);
                }}
              >
                Remove cover
              </button>
            </div>
          )}

          {!coverPreviewUrl && mode === "edit" && !coverFile && (
            <p className="mt-1 text-[11px] text-gray-500">
              No cover set. You can upload a new one.
            </p>
          )}
        </div>
      </div>

      {/* Console / device counts */}
      <div className="grid gap-3 md:grid-cols-3">
        <NumberField
          label="PS5 (count)"
          value={ps5Count}
          onChange={setPs5Count}
        />
        <NumberField
          label="PS4 (count)"
          value={ps4Count}
          onChange={setPs4Count}
        />
        <NumberField
          label="Xbox (count)"
          value={xboxCount}
          onChange={setXboxCount}
        />
        <NumberField
          label="PC (count)"
          value={pcCount}
          onChange={setPcCount}
        />
        <NumberField
          label="Pool tables (count)"
          value={poolCount}
          onChange={setPoolCount}
        />
        <NumberField
          label="Arcade (count)"
          value={arcadeCount}
          onChange={setArcadeCount}
        />
        <NumberField
          label="Snooker tables (count)"
          value={snookerCount}
          onChange={setSnookerCount}
        />
        <NumberField
          label="Steering wheels (count)"
          value={wheelCount}
          onChange={setWheelCount}
        />
        <NumberField
          label="VR sets (count)"
          value={vrCount}
          onChange={setVrCount}
        />
      </div>

      {/* Café details */}
      <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="text-sm font-semibold text-gray-100">Café details</h2>

        <TextRow
          label="Opening hours"
          placeholder="10:00 AM – 11:00 PM (Mon–Sun)"
          value={detailsOpeningHours}
          onChange={setDetailsOpeningHours}
        />
        <TextRow
          label="Peak hours"
          placeholder="Mostly busy between 6 PM – 11 PM"
          value={detailsPeakHours}
          onChange={setDetailsPeakHours}
        />
        <TextRow
          label="Popular games"
          placeholder="Valorant, FIFA, GTA V, Tekken 8, COD Warzone"
          value={detailsPopularGames}
          onChange={setDetailsPopularGames}
        />
        <TextRow
          label="Offers"
          placeholder="10% cashback on first booking"
          value={detailsOffers}
          onChange={setDetailsOffers}
        />
      </div>

      {/* Device specs */}
      <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="text-sm font-semibold text-gray-100">
          Device specifications
        </h2>

        <TextRow
          label="Monitor"
          placeholder="27 inch 240Hz"
          value={specMonitor}
          onChange={setSpecMonitor}
        />
        <TextRow
          label="Processor"
          placeholder="Intel i5 / i7 …"
          value={specProcessor}
          onChange={setSpecProcessor}
        />
        <TextRow
          label="Graphic card"
          placeholder="RTX 3060 / 3070 …"
          value={specGpu}
          onChange={setSpecGpu}
        />
        <TextRow
          label="RAM"
          placeholder="DDR5 32GB 6000Mhz"
          value={specRam}
          onChange={setSpecRam}
        />
        <TextRow
          label="Accessories"
          placeholder="Mechanical keyboard, gaming mouse, headset…"
          value={specAccessories}
          onChange={setSpecAccessories}
        />
      </div>

      {/* Gallery management */}
      <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="text-sm font-semibold text-gray-100">Gallery</h2>

        {/* Existing gallery */}
        {existingGallery.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {existingGallery.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Gallery"
                  className="h-28 w-full rounded-xl object-cover md:h-32"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteGalleryImage(img.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-[1px] text-[10px] font-semibold text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* New gallery files previews */}
        {newGalleryFiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {newGalleryFiles.map((file, idx) => (
              <div key={idx} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(file)}
                  alt="New gallery"
                  className="h-28 w-full rounded-xl object-cover md:h-32"
                />
                <button
                  type="button"
                  onClick={() =>
                    setNewGalleryFiles((prev) =>
                      prev.filter((_, i) => i !== idx)
                    )
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-[1px] text-[10px] font-semibold text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* File input */}
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400">
            You can upload multiple images. They will be added to the café
            gallery.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-1 block text-xs text-gray-400"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setNewGalleryFiles((prev) => [...prev, ...files]);
            }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
      >
        {isSubmitting
          ? mode === "create"
            ? "Creating…"
            : "Saving…"
          : mode === "create"
          ? "Create café"
          : "Save changes"}
      </button>
    </form>
  );
}

// ────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-300">{label}</label>
      <input
        type="number"
        min={0}
        className="mt-1 w-full rounded-xl bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-gray-300">{label}</p>
      <input
        className="w-full rounded-xl bg-neutral-950 px-3 py-2 text-xs outline-none ring-1 ring-neutral-700 focus:ring-sky-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}