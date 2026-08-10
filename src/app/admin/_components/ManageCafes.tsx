// src/app/admin/_components/ManageCafes.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  uploadAdminImage,
  deleteAdminImage,
  addAdminCafeImage,
  removeAdminCafeImage,
} from "@/lib/adminUploads";
import { colors, fonts } from "@/lib/constants";
import useUser from "@/hooks/useUser";

type CafeData = {
  id?: string;
  name: string;
  address: string;
  description: string;
  hourly_price: number | null;
  google_maps_url: string;
  cover_url: string;
  ps5_count: number;
  ps4_count: number;
  xbox_count: number;
  pc_count: number;
  pool_count: number;
  arcade_count: number;
  snooker_count: number;
  steering_wheel_count: number;
  racing_sim_count: number;
  vr_count: number;
  opening_hours: string;
  peak_hours: string;
  popular_games: string;
  offers: string;
  monitor_details: string;
  processor_details: string;
  gpu_details: string;
  ram_details: string;
  accessories_details: string;
  show_tech_specs: boolean;
};

type ConsolePricingTier = {
  qty1_30min: number | null;
  qty1_60min: number | null;
  qty2_30min: number | null;
  qty2_60min: number | null;
  qty3_30min: number | null;
  qty3_60min: number | null;
  qty4_30min: number | null;
  qty4_60min: number | null;
};

type ConsolePricing = {
  [key: string]: ConsolePricingTier;
  ps5: ConsolePricingTier;
  ps4: ConsolePricingTier;
  xbox: ConsolePricingTier;
  pc: ConsolePricingTier;
  pool: ConsolePricingTier;
  arcade: ConsolePricingTier;
  snooker: ConsolePricingTier;
  steering_wheel: ConsolePricingTier;
  vr: ConsolePricingTier;
};

type CafeRow = {
  id: string;
  name: string | null;
  address: string | null;
  description: string | null;
};

type ManageCafesProps = {
  openNewCafe?: boolean;
};

export default function ManageCafes({ openNewCafe = false }: ManageCafesProps = {}) {
  const { user } = useUser();
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCafe, setSelectedCafe] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(openNewCafe);
  const [saving, setSaving] = useState(false);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; image_url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [consolePricing, setConsolePricing] = useState<ConsolePricing>({
    ps5: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    ps4: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    xbox: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    pc: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    pool: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    arcade: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    snooker: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    steering_wheel: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    vr: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
  });

  const [formData, setFormData] = useState<CafeData>({
    name: "",
    address: "",
    description: "",
    hourly_price: null,
    google_maps_url: "",
    cover_url: "",
    ps5_count: 0,
    ps4_count: 0,
    xbox_count: 0,
    pc_count: 0,
    pool_count: 0,
    arcade_count: 0,
    snooker_count: 0,
    steering_wheel_count: 0,
    racing_sim_count: 0,
    vr_count: 0,
    opening_hours: "",
    peak_hours: "",
    popular_games: "",
    offers: "",
    monitor_details: "",
    processor_details: "",
    gpu_details: "",
    ram_details: "",
    accessories_details: "",
    show_tech_specs: true,
  });

  // Load all cafés
  useEffect(() => {
    loadCafes();
  }, []);

  // Handle openNewCafe prop
  useEffect(() => {
    if (openNewCafe) {
      handleNewCafe();
    }
  }, [openNewCafe]);

  async function loadCafes() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("cafes")
        .select("id, name, address, description")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading cafés:", error);
        throw error;
      }

      console.log("Loaded cafés:", data);
      setCafes((data as CafeRow[]) || []);
    } catch (err) {
      console.error("Error loading cafés:", err);
      alert("Failed to load cafés: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  // Load café details for editing
  async function loadCafeDetails(cafeId: string) {
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("cafes")
        .select("*")
        .eq("id", cafeId)
        .single();

      if (error) {
        console.error("Error loading café:", error);
        throw error;
      }

      if (data) {
        setFormData({
          id: data.id,
          name: data.name || "",
          address: data.address || "",
          description: data.description || "",
          hourly_price: data.hourly_price,
          google_maps_url: data.google_maps_url || "",
          cover_url: data.cover_url || "",
          ps5_count: data.ps5_count || 0,
          ps4_count: data.ps4_count || 0,
          xbox_count: data.xbox_count || 0,
          pc_count: data.pc_count || 0,
          pool_count: data.pool_count || 0,
          arcade_count: data.arcade_count || 0,
          snooker_count: data.snooker_count || 0,
          steering_wheel_count: data.steering_wheel_count || 0,
          racing_sim_count: data.racing_sim_count || 0,
          vr_count: data.vr_count || 0,
          opening_hours: data.opening_hours || "",
          peak_hours: data.peak_hours || "",
          popular_games: data.popular_games || "",
          offers: data.offers || "",
          monitor_details: data.monitor_details || "",
          processor_details: data.processor_details || "",
          gpu_details: data.gpu_details || "",
          ram_details: data.ram_details || "",
          accessories_details: data.accessories_details || "",
          show_tech_specs: data.show_tech_specs ?? true,
        });
        setSelectedCafe(cafeId);
        setIsCreating(false);

        // Load gallery images and console pricing
        loadGalleryImages(cafeId);
        loadConsolePricing(cafeId);
      }
    } catch (err) {
      console.error("Error loading café details:", err);
      alert("Failed to load café details: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  // Load gallery images
  async function loadGalleryImages(cafeId: string) {
    try {
      const res = await fetch(
        `/api/admin/cafe-images?cafeId=${encodeURIComponent(cafeId)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load images");

      setGalleryImages(data.images || []);
    } catch (err) {
      console.error("Error loading gallery images:", err);
    }
  }

  // Load console pricing
  async function loadConsolePricing(cafeId: string) {
    try {
      const { data, error } = await supabase
        .from("console_pricing")
        .select("console_type, quantity, duration_minutes, price")
        .eq("cafe_id", cafeId);

      if (error) throw error;

      // Convert array to nested object structure
      const pricingMap: ConsolePricing = {
        ps5: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        ps4: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        xbox: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        pc: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        pool: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        arcade: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        snooker: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        steering_wheel: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
        vr: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      };

      if (data) {
        data.forEach((item) => {
          const consoleType = item.console_type;
          const qty = item.quantity;
          const duration = item.duration_minutes;
          const price = item.price;

          if (pricingMap[consoleType] && qty >= 1 && qty <= 4 && (duration === 30 || duration === 60)) {
            const qtyKey = `qty${qty}_${duration}min` as keyof ConsolePricingTier;
            pricingMap[consoleType][qtyKey] = price;
          }
        });
      }

      setConsolePricing(pricingMap);
    } catch (err) {
      console.error("Error loading console pricing:", err);
    }
  }

  // Add new gallery image via upload
  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedCafe) {
      alert("Please select an image file");
      return;
    }

    // Check file type
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file");
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 4 * 1024 * 1024) {
      alert("Image size should be less than 4MB");
      return;
    }

    try {
      setUploading(true);

      // Through this origin: the direct Storage call is blocked on the cafés'
      // ISP, which admins work from too.
      const { url: imageUrl } = await uploadAdminImage(file, "gallery", selectedCafe);
      const image = await addAdminCafeImage(selectedCafe, imageUrl);

      if (image) {
        setGalleryImages([image, ...galleryImages]);
        alert("Image uploaded successfully!");
      }

      // Reset file input
      event.target.value = "";
    } catch (err) {
      console.error("Error uploading image:", err);
      alert("Failed to upload image: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  // Delete gallery image
  async function handleDeleteImage(imageId: string) {
    if (!confirm("Are you sure you want to delete this image?")) return;

    try {
      const image = galleryImages.find((img) => img.id === imageId);

      await removeAdminCafeImage(imageId);
      // The stored file goes after the row: an orphaned file is tidier to live
      // with than a gallery entry pointing at a picture that is gone.
      await deleteAdminImage(image?.image_url);

      setGalleryImages(galleryImages.filter(img => img.id !== imageId));
      alert("Image deleted successfully!");
    } catch (err) {
      console.error("Error deleting image:", err);
      alert("Failed to delete image: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Save console pricing
  async function saveConsolePricing(cafeId: string) {
    try {
      // Delete existing pricing for this café
      const { error: deleteError } = await supabase
        .from("console_pricing")
        .delete()
        .eq("cafe_id", cafeId);

      if (deleteError) throw deleteError;

      // Insert new pricing (only for consoles with prices set)
      const pricingData: Array<{
        cafe_id: string;
        console_type: string;
        quantity: number;
        duration_minutes: number;
        price: number;
      }> = [];

      Object.entries(consolePricing).forEach(([console_type, tiers]) => {
        if (!tiers) return;

        // Add entry for each quantity and duration tier if price is set
        // Quantity 1
        if (tiers.qty1_30min !== null && tiers.qty1_30min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 1, duration_minutes: 30, price: tiers.qty1_30min });
        }
        if (tiers.qty1_60min !== null && tiers.qty1_60min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 1, duration_minutes: 60, price: tiers.qty1_60min });
        }

        // Quantity 2
        if (tiers.qty2_30min !== null && tiers.qty2_30min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 2, duration_minutes: 30, price: tiers.qty2_30min });
        }
        if (tiers.qty2_60min !== null && tiers.qty2_60min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 2, duration_minutes: 60, price: tiers.qty2_60min });
        }

        // Quantity 3
        if (tiers.qty3_30min !== null && tiers.qty3_30min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 3, duration_minutes: 30, price: tiers.qty3_30min });
        }
        if (tiers.qty3_60min !== null && tiers.qty3_60min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 3, duration_minutes: 60, price: tiers.qty3_60min });
        }

        // Quantity 4
        if (tiers.qty4_30min !== null && tiers.qty4_30min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 4, duration_minutes: 30, price: tiers.qty4_30min });
        }
        if (tiers.qty4_60min !== null && tiers.qty4_60min > 0) {
          pricingData.push({ cafe_id: cafeId, console_type, quantity: 4, duration_minutes: 60, price: tiers.qty4_60min });
        }
      });

      if (pricingData.length > 0) {
        const { error: insertError } = await supabase
          .from("console_pricing")
          .insert(pricingData);

        if (insertError) throw insertError;
      }

      console.log("Console pricing saved successfully");
    } catch (err) {
      console.error("Error saving console pricing:", err);
      throw new Error("Failed to save console pricing: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function handleNewCafe() {
    setFormData({
      name: "",
      address: "",
      description: "",
      hourly_price: null,
      google_maps_url: "",
      cover_url: "",
      ps5_count: 0,
      ps4_count: 0,
      xbox_count: 0,
      pc_count: 0,
      pool_count: 0,
      arcade_count: 0,
      snooker_count: 0,
      steering_wheel_count: 0,
      racing_sim_count: 0,
      vr_count: 0,
      opening_hours: "",
      peak_hours: "",
      popular_games: "",
      offers: "",
      monitor_details: "",
      processor_details: "",
      gpu_details: "",
      ram_details: "",
      accessories_details: "",
      show_tech_specs: true,
    });
    setSelectedCafe(null);
    setIsCreating(true);
    setGalleryImages([]);
    setConsolePricing({
      ps5: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      ps4: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      xbox: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      pc: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      pool: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      arcade: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      snooker: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      steering_wheel: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
      vr: { qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null, qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null },
    });
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert("Please enter a café name");
      return;
    }

    try {
      setSaving(true);

      if (isCreating) {
        // Create new café
        if (!user) {
          alert("You must be logged in to create a café");
          return;
        }

        const { data, error } = await supabase
          .from("cafes")
          .insert([
            {
              ...formData,
              owner_id: user.id,
            },
          ])
          .select();

        if (error) throw error;

        if (data && data[0]) {
          // Save console pricing
          await saveConsolePricing(data[0].id);

          alert("Café created successfully!");
          loadCafes();
          setIsCreating(false);
          setSelectedCafe(data[0].id);
        }
      } else if (selectedCafe) {
        // Update existing café
        const { error } = await supabase
          .from("cafes")
          .update(formData)
          .eq("id", selectedCafe);

        if (error) throw error;

        // Save console pricing
        await saveConsolePricing(selectedCafe);

        alert("Café updated successfully!");
        loadCafes();
      }
    } catch (err) {
      console.error("Error saving café:", err);
      alert("Failed to save café: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setIsCreating(false);
    setSelectedCafe(null);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.darkerCard,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.body,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  // Unused style - removed to fix lint warning

  if (loading) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: colors.textSecondary,
          fontSize: 14,
        }}
      >
        Loading cafés...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Left sidebar - Café list */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: colors.darkCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontFamily: fonts.heading,
                color: colors.textPrimary,
                margin: 0,
              }}
            >
              All Cafés
            </h3>
            <span
              style={{
                fontSize: 12,
                color: colors.textMuted,
                background: colors.darkerCard,
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              {cafes.length}
            </span>
          </div>

          <button
            onClick={handleNewCafe}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 16,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(16,185,129,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            + New Café
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cafes.map((cafe) => (
              <button
                key={cafe.id}
                onClick={() => loadCafeDetails(cafe.id)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 8,
                  border: `1px solid ${
                    selectedCafe === cafe.id ? colors.cyan : colors.border
                  }`,
                  background:
                    selectedCafe === cafe.id
                      ? "rgba(0,240,255,0.1)"
                      : colors.darkerCard,
                  color:
                    selectedCafe === cafe.id ? colors.cyan : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: selectedCafe === cafe.id ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (selectedCafe !== cafe.id) {
                    e.currentTarget.style.borderColor = colors.textMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedCafe !== cafe.id) {
                    e.currentTarget.style.borderColor = colors.border;
                  }
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {cafe.name || "Untitled"}
                </div>
                {cafe.address && (
                  <div
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cafe.address}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div style={{ flex: 1 }}>
        {!selectedCafe && !isCreating ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              background: colors.darkCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              color: colors.textSecondary,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>
              🏪
            </div>
            <p style={{ fontSize: 16, margin: 0 }}>
              Select a café to edit or create a new one
            </p>
          </div>
        ) : (
          <div
            style={{
              background: colors.darkCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontFamily: fonts.heading,
                  color: colors.textPrimary,
                  margin: 0,
                }}
              >
                {isCreating ? "Create New Café" : "Edit Café"}
              </h2>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    background: colors.darkerCard,
                    color: colors.textSecondary,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.textMuted;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.border;
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: saving
                      ? colors.textMuted
                      : "linear-gradient(135deg, #a855f7, #ec4899)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 8px 16px rgba(168,85,247,0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }
                  }}
                >
                  {saving ? "Saving..." : "Save Café"}
                </button>
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Basic Information */}
              <section>
                <h3
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.heading,
                    color: colors.cyan,
                    marginBottom: 16,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Basic Information
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Café Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Enter café name"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Hourly Price (₹)</label>
                    <input
                      type="number"
                      value={formData.hourly_price || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          hourly_price: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="Enter hourly price"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Enter full address"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Enter café description"
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Google Maps URL</label>
                  <input
                    type="text"
                    value={formData.google_maps_url}
                    onChange={(e) =>
                      setFormData({ ...formData, google_maps_url: e.target.value })
                    }
                    placeholder="Enter Google Maps URL"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Cover Image URL</label>
                  <input
                    type="text"
                    value={formData.cover_url}
                    onChange={(e) =>
                      setFormData({ ...formData, cover_url: e.target.value })
                    }
                    placeholder="Enter cover image URL"
                    style={inputStyle}
                  />
                  {formData.cover_url && (
                    <div style={{ marginTop: 12 }}>
                      <img
                        src={formData.cover_url}
                        alt="Cover preview"
                        style={{
                          width: "100%",
                          maxHeight: 200,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${colors.border}`,
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Console Counts */}
              <section>
                <h3
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.heading,
                    color: colors.purple,
                    marginBottom: 16,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Gaming Consoles & Equipment
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[
                    { key: "ps5_count", label: "PS5 Count" },
                    { key: "ps4_count", label: "PS4 Count" },
                    { key: "xbox_count", label: "Xbox Count" },
                    { key: "pc_count", label: "PC Count" },
                    { key: "pool_count", label: "Pool Tables" },
                    { key: "arcade_count", label: "Arcade Machines" },
                    { key: "snooker_count", label: "Snooker Tables" },
                    { key: "steering_wheel_count", label: "Steering Wheels" },
                    { key: "racing_sim_count", label: "Racing Sims" },
                    { key: "vr_count", label: "VR Headsets" },
                  ].map((field) => (
                    <div key={field.key}>
                      <label style={labelStyle}>{field.label}</label>
                      <input
                        type="number"
                        min="0"
                        value={formData[field.key as keyof CafeData] as number}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.key]: Number(e.target.value) || 0,
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Console Pricing */}
              <section>
                <div style={{ marginBottom: 16 }}>
                  <h3
                    style={{
                      fontSize: 14,
                      fontFamily: fonts.heading,
                      color: "#fbbf24",
                      margin: 0,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Console Pricing (₹ per hour by quantity)
                  </h3>
                  <p
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                      marginTop: 6,
                      marginBottom: 0,
                    }}
                  >
                    Set prices for 30-minute and 60-minute sessions. Max: VR/Steering Wheel (1), Pool/Snooker/Arcade (2), Others (4).
                  </p>
                </div>

                {[
                  { key: "ps5", label: "🎮 PS5", icon: "🎮" },
                  { key: "ps4", label: "🎮 PS4", icon: "🎮" },
                  { key: "xbox", label: "🎮 Xbox", icon: "🎮" },
                  { key: "pc", label: "💻 Gaming PC", icon: "💻" },
                  { key: "pool", label: "🎱 Pool Table", icon: "🎱" },
                  { key: "arcade", label: "🕹️ Arcade", icon: "🕹️" },
                  { key: "snooker", label: "🎱 Snooker", icon: "🎱" },
                  { key: "steering_wheel", label: "🏎️ Racing Wheel", icon: "🏎️" },
                  { key: "vr", label: "🥽 VR Headset", icon: "🥽" },
                ].map((field) => {
                  const maxQty = ["pool", "snooker", "arcade"].includes(field.key)
                    ? 2
                    : ["pc", "vr", "steering_wheel"].includes(field.key)
                    ? 1
                    : 4;

                  return (
                    <div
                      key={field.key}
                      style={{
                        marginBottom: 20,
                        padding: "16px",
                        borderRadius: 12,
                        background: "rgba(251, 191, 36, 0.05)",
                        border: "1px solid rgba(251, 191, 36, 0.2)",
                      }}
                    >
                      <div style={{ marginBottom: 12, fontWeight: 600, color: colors.textPrimary, fontSize: 14 }}>
                        {field.label}
                      </div>

                      {/* Quantity 1 */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" }}>
                          1 Console
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={labelStyle}>30 Minutes</label>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={consolePricing[field.key]?.qty1_30min || ""}
                              onChange={(e) =>
                                setConsolePricing({
                                  ...consolePricing,
                                  [field.key]: {
                                    ...consolePricing[field.key],
                                    qty1_30min: e.target.value ? Number(e.target.value) : null,
                                  },
                                })
                              }
                              placeholder="₹"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>60 Minutes</label>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={consolePricing[field.key]?.qty1_60min || ""}
                              onChange={(e) =>
                                setConsolePricing({
                                  ...consolePricing,
                                  [field.key]: {
                                    ...consolePricing[field.key],
                                    qty1_60min: e.target.value ? Number(e.target.value) : null,
                                  },
                                })
                              }
                              placeholder="₹"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quantity 2+ only for consoles that support it */}
                      {maxQty >= 2 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" }}>
                            2 Consoles
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>30 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty2_30min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty2_30min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>60 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty2_60min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty2_60min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {maxQty >= 3 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" }}>
                            3 Consoles
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>30 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty3_30min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty3_30min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>60 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty3_60min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty3_60min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {maxQty >= 4 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" }}>
                            4 Consoles
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>30 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty4_30min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty4_30min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>60 Minutes</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={consolePricing[field.key]?.qty4_60min || ""}
                                onChange={(e) =>
                                  setConsolePricing({
                                    ...consolePricing,
                                    [field.key]: {
                                      ...consolePricing[field.key],
                                      qty4_60min: e.target.value ? Number(e.target.value) : null,
                                    },
                                  })
                                }
                                placeholder="₹"
                                style={inputStyle}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {/* Operating Details */}
              <section>
                <h3
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.heading,
                    color: colors.orange,
                    marginBottom: 16,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Operating Details
                </h3>
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Opening Hours</label>
                    <input
                      type="text"
                      value={formData.opening_hours}
                      onChange={(e) =>
                        setFormData({ ...formData, opening_hours: e.target.value })
                      }
                      placeholder="e.g., Mon-Sun: 10:00 AM - 11:00 PM"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Peak Hours</label>
                    <input
                      type="text"
                      value={formData.peak_hours}
                      onChange={(e) =>
                        setFormData({ ...formData, peak_hours: e.target.value })
                      }
                      placeholder="e.g., 6:00 PM - 10:00 PM"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Popular Games</label>
                    <textarea
                      value={formData.popular_games}
                      onChange={(e) =>
                        setFormData({ ...formData, popular_games: e.target.value })
                      }
                      placeholder="List popular games available"
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Offers</label>
                    <textarea
                      value={formData.offers}
                      onChange={(e) =>
                        setFormData({ ...formData, offers: e.target.value })
                      }
                      placeholder="Special offers and deals"
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </div>
              </section>

              {/* Technical Specifications */}
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3
                    style={{
                      fontSize: 14,
                      fontFamily: fonts.heading,
                      color: colors.green,
                      margin: 0,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Technical Specifications
                  </h3>

                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <span style={{ fontSize: 12, color: colors.textSecondary }}>
                      Show on café page
                    </span>
                    <div
                      onClick={() => setFormData({ ...formData, show_tech_specs: !formData.show_tech_specs })}
                      style={{
                        position: "relative",
                        width: 48,
                        height: 24,
                        borderRadius: 12,
                        background: formData.show_tech_specs
                          ? "linear-gradient(135deg, #10b981, #059669)"
                          : colors.border,
                        transition: "all 0.3s",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 2,
                          left: formData.show_tech_specs ? 26 : 2,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "all 0.3s",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </label>
                </div>

                {!formData.show_tech_specs && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: "rgba(251,191,36,0.1)",
                      border: "1px solid rgba(251,191,36,0.3)",
                      color: colors.orange,
                      fontSize: 12,
                      marginBottom: 16,
                    }}
                  >
                    ⚠️ Technical specifications will be hidden on the café page
                  </div>
                )}

                <div style={{ display: "grid", gap: 16, opacity: formData.show_tech_specs ? 1 : 0.5 }}>
                  <div>
                    <label style={labelStyle}>Monitor Details</label>
                    <textarea
                      value={formData.monitor_details}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          monitor_details: e.target.value,
                        })
                      }
                      placeholder="Monitor specifications"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Processor Details</label>
                    <textarea
                      value={formData.processor_details}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          processor_details: e.target.value,
                        })
                      }
                      placeholder="CPU specifications"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>GPU Details</label>
                    <textarea
                      value={formData.gpu_details}
                      onChange={(e) =>
                        setFormData({ ...formData, gpu_details: e.target.value })
                      }
                      placeholder="Graphics card specifications"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>RAM Details</label>
                    <textarea
                      value={formData.ram_details}
                      onChange={(e) =>
                        setFormData({ ...formData, ram_details: e.target.value })
                      }
                      placeholder="RAM specifications"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Accessories Details</label>
                    <textarea
                      value={formData.accessories_details}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accessories_details: e.target.value,
                        })
                      }
                      placeholder="Available accessories"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </div>
              </section>

              {/* Gallery Images */}
              <section
                style={{
                  marginBottom: 24,
                  padding: 20,
                  borderRadius: 16,
                  background: "rgba(147, 51, 234, 0.08)",
                  border: "1px solid rgba(147, 51, 234, 0.3)",
                }}
              >
                <div
                  style={{
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: "1px solid rgba(147, 51, 234, 0.2)",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 16,
                      margin: 0,
                      color: "#e9d5ff",
                    }}
                  >
                    Gallery Images
                  </h3>
                  <p
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    Manage gallery images for this café
                  </p>
                </div>

                {/* Add new image */}
                <div
                  style={{
                    marginBottom: 20,
                  }}
                >
                  <label
                    htmlFor="gallery-upload"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 20px",
                      borderRadius: 8,
                      border: "2px dashed rgba(147, 51, 234, 0.5)",
                      background: "rgba(147, 51, 234, 0.05)",
                      color: "#e9d5ff",
                      fontFamily: fonts.heading,
                      fontSize: 13,
                      letterSpacing: 0.5,
                      cursor: selectedCafe && !uploading ? "pointer" : "not-allowed",
                      opacity: selectedCafe && !uploading ? 1 : 0.5,
                      transition: "all 0.2s",
                      fontWeight: 600,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCafe && !uploading) {
                        e.currentTarget.style.background = "rgba(147, 51, 234, 0.15)";
                        e.currentTarget.style.borderColor = "rgba(147, 51, 234, 0.8)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(147, 51, 234, 0.05)";
                      e.currentTarget.style.borderColor = "rgba(147, 51, 234, 0.5)";
                    }}
                  >
                    <span style={{ fontSize: 18 }}>📸</span>
                    {uploading ? "Uploading..." : "Upload Image"}
                  </label>
                  <input
                    id="gallery-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={!selectedCafe || uploading}
                    style={{ display: "none" }}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                      marginTop: 8,
                      marginBottom: 0,
                    }}
                  >
                    Supported formats: JPG, PNG, GIF, WebP (Max 5MB)
                  </p>
                </div>

                {/* Gallery grid */}
                {selectedCafe && galleryImages.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {galleryImages.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          position: "relative",
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid rgba(147, 51, 234, 0.3)",
                          background: "rgba(15, 23, 42, 0.6)",
                        }}
                      >
                        <img
                          src={img.image_url}
                          alt="Gallery"
                          style={{
                            width: "100%",
                            height: 150,
                            objectFit: "cover",
                            display: "block",
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://via.placeholder.com/200x150?text=Image+Not+Found";
                          }}
                        />
                        <button
                          onClick={() => handleDeleteImage(img.id)}
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "rgba(239, 68, 68, 0.9)",
                            color: "white",
                            fontSize: 11,
                            fontFamily: fonts.heading,
                            cursor: "pointer",
                            letterSpacing: 0.5,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedCafe && galleryImages.length === 0 && (
                  <div
                    style={{
                      padding: "30px 20px",
                      textAlign: "center",
                      color: colors.textSecondary,
                      fontSize: 13,
                    }}
                  >
                    No gallery images yet. Add one using the form above.
                  </div>
                )}

                {!selectedCafe && (
                  <div
                    style={{
                      padding: "30px 20px",
                      textAlign: "center",
                      color: colors.textMuted,
                      fontSize: 13,
                    }}
                  >
                    Select a café to manage its gallery images
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
