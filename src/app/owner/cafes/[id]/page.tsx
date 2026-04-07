// src/app/owner/cafes/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useOwnerAuth } from "@/app/owner/hooks/useOwnerAuth";
import { colors, fonts } from "@/lib/constants";

type CafeFormData = {
  name: string;
  address: string;
  description: string;
  hourly_price: number;
  google_maps_url: string;
  instagram_url: string;
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

type ConsolePricing = {
  console_type: string;
  quantity: number;
  duration_minutes: number;
  price: number;
};

type CafeImage = {
  id: string;
  image_url: string;
  cafe_id: string;
};

const CONSOLE_TYPES = [
  { id: "ps5", label: "PS5", icon: "🎮", maxQty: 4 },
  { id: "ps4", label: "PS4", icon: "🎮", maxQty: 4 },
  { id: "xbox", label: "Xbox", icon: "🎮", maxQty: 4 },
  { id: "pc", label: "PC", icon: "💻", maxQty: 4 },
  { id: "pool", label: "Pool", icon: "🎱", maxQty: 2 },
  { id: "snooker", label: "Snooker", icon: "🎱", maxQty: 2 },
  { id: "arcade", label: "Arcade", icon: "🕹️", maxQty: 4 },
  { id: "vr", label: "VR", icon: "🥽", maxQty: 4 },
  { id: "steering_wheel", label: "Steering Wheel", icon: "🏎️", maxQty: 4 },
  { id: "racing_sim", label: "Racing Sim", icon: "🏁", maxQty: 4 },
];

export default function OwnerCafeEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { allowed, checkingRole } = useOwnerAuth();
  const cafeId = params?.id;

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "pricing" | "photos">("details");

  const [formData, setFormData] = useState<CafeFormData>({
    name: "",
    address: "",
    description: "",
    hourly_price: 150,
    google_maps_url: "",
    instagram_url: "",
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
    opening_hours: "10:00 AM - 11:00 PM",
    peak_hours: "6:00 PM - 10:00 PM",
    popular_games: "",
    offers: "",
    monitor_details: "",
    processor_details: "",
    gpu_details: "",
    ram_details: "",
    accessories_details: "",
    show_tech_specs: false,
  });

  const [consolePricing, setConsolePricing] = useState<ConsolePricing[]>([]);
  const [cafeImages, setCafeImages] = useState<CafeImage[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Load cafe data via owner-authenticated API routes
  useEffect(() => {
    if (checkingRole || !allowed || !cafeId) return;

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        setHasAccess(null);

        const [cafeRes, pricingRes, imagesRes] = await Promise.all([
          fetch(`/api/owner/cafes?cafeId=${encodeURIComponent(cafeId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/owner/console-pricing?cafeId=${encodeURIComponent(cafeId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/owner/cafe-images?cafeId=${encodeURIComponent(cafeId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [cafePayload, pricingPayload, imagesPayload] = await Promise.all([
          cafeRes.json().catch(() => ({})),
          pricingRes.json().catch(() => ({})),
          imagesRes.json().catch(() => ({})),
        ]);

        if (!cafeRes.ok) {
          if (!cancelled) {
            setHasAccess(false);
            setError(cafePayload.error || "Could not verify café ownership");
          }
          return;
        }

        if (!pricingRes.ok) {
          throw new Error(pricingPayload.error || "Could not load console pricing");
        }

        if (!imagesRes.ok) {
          throw new Error(imagesPayload.error || "Could not load café images");
        }

        const cafe = cafePayload.cafe;
        if (cancelled) return;

        if (cafe) {
          setFormData({
            name: cafe.name || "",
            address: cafe.address || "",
            description: cafe.description || "",
            hourly_price: cafe.hourly_price || 150,
            google_maps_url: cafe.google_maps_url || "",
            instagram_url: cafe.instagram_url || "",
            cover_url: cafe.cover_url || "",
            ps5_count: cafe.ps5_count || 0,
            ps4_count: cafe.ps4_count || 0,
            xbox_count: cafe.xbox_count || 0,
            pc_count: cafe.pc_count || 0,
            pool_count: cafe.pool_count || 0,
            arcade_count: cafe.arcade_count || 0,
            snooker_count: cafe.snooker_count || 0,
            steering_wheel_count: cafe.steering_wheel_count || 0,
            racing_sim_count: cafe.racing_sim_count || 0,
            vr_count: cafe.vr_count || 0,
            opening_hours: cafe.opening_hours || "10:00 AM - 11:00 PM",
            peak_hours: cafe.peak_hours || "6:00 PM - 10:00 PM",
            popular_games: cafe.popular_games || "",
            offers: cafe.offers || "",
            monitor_details: cafe.monitor_details || "",
            processor_details: cafe.processor_details || "",
            gpu_details: cafe.gpu_details || "",
            ram_details: cafe.ram_details || "",
            accessories_details: cafe.accessories_details || "",
            show_tech_specs: cafe.show_tech_specs || false,
          });
        }
        setConsolePricing((pricingPayload.pricing || []) as ConsolePricing[]);
        setCafeImages((imagesPayload.images || []) as CafeImage[]);
        setHasAccess(true);
      } catch (err) {
        console.error("Error loading data:", err);
        if (!cancelled) {
          setHasAccess((prev) => prev ?? true);
          setError((err instanceof Error ? err.message : String(err)) || "Could not load café details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [allowed, checkingRole, cafeId]);

  // Save cafe details
  async function handleSaveDetails() {
    if (!cafeId) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch("/api/owner/cafes", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, updates: formData }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to save changes");
      }

      setSuccessMessage("Café details updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error saving cafe:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  // Get pricing value
  function getPricingValue(consoleType: string, quantity: number, duration: number): number {
    const pricing = consolePricing.find(
      (p) => p.console_type === consoleType && p.quantity === quantity && p.duration_minutes === duration
    );
    return pricing?.price || 0;
  }

  // Update pricing
  async function updatePricing(consoleType: string, quantity: number, duration: number, price: number) {
    const existing = consolePricing.find(
      (p) => p.console_type === consoleType && p.quantity === quantity && p.duration_minutes === duration
    );

    try {
      const response = await fetch("/api/owner/console-pricing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, consoleType, quantity, duration, price }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to update pricing");
      }

      setConsolePricing((prev) =>
        existing
          ? prev.map((p) =>
              p.console_type === consoleType && p.quantity === quantity && p.duration_minutes === duration
                ? { ...p, price }
                : p
            )
          : [...prev, { console_type: consoleType, quantity, duration_minutes: duration, price }]
      );

      setSuccessMessage("Pricing updated!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Error updating pricing:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to update pricing");
    }
  }

  // Upload image file to storage
  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !cafeId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB");
      return;
    }

    try {
      setUploadingImage(true);
      setError(null);

      // Create unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${cafeId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("cafe_images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("cafe_images")
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // Save to database
      const response = await fetch("/api/owner/cafe-images", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, imageUrl }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to upload image");
      }

      setCafeImages((prev) => [...prev, result.image as CafeImage]);
      setSuccessMessage("Image uploaded successfully!");
      setTimeout(() => setSuccessMessage(null), 2000);

      // Reset file input
      event.target.value = "";
    } catch (err) {
      console.error("Error uploading image:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  // Add image via URL
  async function handleAddImage() {
    if (!newImageUrl || !cafeId) return;

    try {
      const response = await fetch("/api/owner/cafe-images", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, imageUrl: newImageUrl }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to add image");
      }

      setCafeImages((prev) => [...prev, result.image as CafeImage]);
      setNewImageUrl("");
      setSuccessMessage("Image added successfully!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Error adding image:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to add image");
    }
  }

  // Update cover photo
  async function handleUpdateCoverPhoto(imageUrl: string) {
    if (!cafeId) return;

    try {
      const response = await fetch("/api/owner/cafes", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, updates: { cover_url: imageUrl } }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to update cover photo");
      }

      setFormData((prev) => ({ ...prev, cover_url: imageUrl }));
      setSuccessMessage("Cover photo updated!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Error updating cover photo:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to update cover photo");
    }
  }

  // Delete image
  async function handleDeleteImage(imageId: string) {
    if (!confirm("Are you sure you want to delete this image?")) return;

    try {
      const response = await fetch("/api/owner/cafe-images", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete image");
      }

      setCafeImages((prev) => prev.filter((img) => img.id !== imageId));
      setSuccessMessage("Image deleted successfully!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Error deleting image:", err);
      setError((err instanceof Error ? err.message : String(err)) || "Failed to delete image");
    }
  }

  // Loading state
  if (checkingRole || loading || hasAccess === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.textPrimary,
        }}
      >
        Loading...
      </div>
    );
  }

  // Access denied
  if (hasAccess === false) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 20 }}>🔒</div>
        <h1 style={{ fontSize: 24, marginBottom: 12, color: colors.textPrimary }}>
          Access Denied
        </h1>
        <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 24 }}>
          {error || "You don't have permission to edit this café"}
        </p>
        <button
          onClick={() => router.push("/owner")}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        fontFamily: fonts.body,
        color: colors.textPrimary,
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
          borderBottom: `1px solid ${colors.border}`,
          padding: "24px 32px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <button
            onClick={() => router.push("/owner")}
            style={{
              border: "none",
              background: "transparent",
              color: colors.textSecondary,
              fontSize: 13,
              marginBottom: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            ← Back to Dashboard
          </button>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: 28,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Edit Café - {formData.name}
          </h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>
            Manage your gaming café information, pricing, and photos
          </p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div style={{ background: "rgba(15,23,42,0.5)", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", gap: 8 }}>
          {[
            { id: "details" as const, label: "Café Details", icon: "ℹ️" },
            { id: "pricing" as const, label: "Console Pricing", icon: "💰" },
            { id: "photos" as const, label: "Photo Gallery", icon: "📸" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "16px 24px",
                border: "none",
                borderBottom: activeTab === tab.id ? `3px solid ${colors.cyan}` : "3px solid transparent",
                background: activeTab === tab.id ? "rgba(0, 240, 255, 0.05)" : "transparent",
                color: activeTab === tab.id ? colors.cyan : colors.textSecondary,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>
        {/* Success Message */}
        {successMessage && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#22c55e",
              marginBottom: 24,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            {successMessage}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Cafe Details Tab */}
        {activeTab === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Basic Information */}
            <Section title="Basic Information" icon="ℹ️">
              <FormField label="Café Name *" required>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter café name"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Address *" required>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter full address"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </FormField>

              <FormField label="Description">
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your gaming café"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </FormField>

              <FormField label="Google Maps URL">
                <input
                  type="url"
                  value={formData.google_maps_url}
                  onChange={(e) => setFormData({ ...formData, google_maps_url: e.target.value })}
                  placeholder="https://maps.google.com/..."
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Instagram URL">
                <input
                  type="url"
                  value={formData.instagram_url}
                  onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                  placeholder="https://instagram.com/your_cafe"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Cover Image URL">
                <input
                  type="url"
                  value={formData.cover_url}
                  onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                  placeholder="https://example.com/cover.jpg"
                  style={inputStyle}
                />
              </FormField>
            </Section>

            {/* Pricing & Hours */}
            <Section title="Operating Hours" icon="⏰">
              <FormField label="Default Hourly Price (₹) *" required>
                <input
                  type="number"
                  value={formData.hourly_price}
                  onChange={(e) => setFormData({ ...formData, hourly_price: parseInt(e.target.value) || 0 })}
                  min="0"
                  step="10"
                  style={inputStyle}
                />
                <p style={{ fontSize: 12, color: colors.textMuted, margin: "4px 0 0 0" }}>
                  This is used as fallback when specific console pricing is not set
                </p>
              </FormField>

              <FormField label="Opening Hours">
                <input
                  type="text"
                  value={formData.opening_hours}
                  onChange={(e) => setFormData({ ...formData, opening_hours: e.target.value })}
                  placeholder="e.g., 10:00 AM - 11:00 PM"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Peak Hours">
                <input
                  type="text"
                  value={formData.peak_hours}
                  onChange={(e) => setFormData({ ...formData, peak_hours: e.target.value })}
                  placeholder="e.g., 6:00 PM - 10:00 PM"
                  style={inputStyle}
                />
              </FormField>
            </Section>

            {/* Gaming Equipment */}
            <Section title="Gaming Equipment" icon="🎮">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <FormField label="PS5 Consoles">
                  <input
                    type="number"
                    value={formData.ps5_count}
                    onChange={(e) => setFormData({ ...formData, ps5_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="PS4 Consoles">
                  <input
                    type="number"
                    value={formData.ps4_count}
                    onChange={(e) => setFormData({ ...formData, ps4_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Xbox Consoles">
                  <input
                    type="number"
                    value={formData.xbox_count}
                    onChange={(e) => setFormData({ ...formData, xbox_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="PC Gaming Stations">
                  <input
                    type="number"
                    value={formData.pc_count}
                    onChange={(e) => setFormData({ ...formData, pc_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Pool Tables">
                  <input
                    type="number"
                    value={formData.pool_count}
                    onChange={(e) => setFormData({ ...formData, pool_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Snooker Tables">
                  <input
                    type="number"
                    value={formData.snooker_count}
                    onChange={(e) => setFormData({ ...formData, snooker_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Arcade Machines">
                  <input
                    type="number"
                    value={formData.arcade_count}
                    onChange={(e) => setFormData({ ...formData, arcade_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="VR Stations">
                  <input
                    type="number"
                    value={formData.vr_count}
                    onChange={(e) => setFormData({ ...formData, vr_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Steering Wheel">
                  <input
                    type="number"
                    value={formData.steering_wheel_count}
                    onChange={(e) => setFormData({ ...formData, steering_wheel_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Racing Sim">
                  <input
                    type="number"
                    value={formData.racing_sim_count}
                    onChange={(e) => setFormData({ ...formData, racing_sim_count: parseInt(e.target.value) || 0 })}
                    min="0"
                    style={inputStyle}
                  />
                </FormField>
              </div>
            </Section>

            {/* Additional Details */}
            <Section title="Additional Details" icon="📝">
              <FormField label="Popular Games">
                <textarea
                  value={formData.popular_games}
                  onChange={(e) => setFormData({ ...formData, popular_games: e.target.value })}
                  placeholder="List popular games available (comma-separated)"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </FormField>

              <FormField label="Special Offers">
                <textarea
                  value={formData.offers}
                  onChange={(e) => setFormData({ ...formData, offers: e.target.value })}
                  placeholder="Enter any special offers or promotions"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </FormField>
            </Section>

            {/* Technical Specifications */}
            <Section title="Technical Specifications" icon="⚙️">
              <FormField label="Show Tech Specs on Café Page">
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formData.show_tech_specs}
                    onChange={(e) => setFormData({ ...formData, show_tech_specs: e.target.checked })}
                    style={{ width: 20, height: 20, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 14, color: colors.textSecondary }}>
                    Display technical specifications to customers
                  </span>
                </label>
              </FormField>

              <FormField label="Monitor Details">
                <input
                  type="text"
                  value={formData.monitor_details}
                  onChange={(e) => setFormData({ ...formData, monitor_details: e.target.value })}
                  placeholder="e.g., 27-inch 144Hz Gaming Monitor"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Processor Details">
                <input
                  type="text"
                  value={formData.processor_details}
                  onChange={(e) => setFormData({ ...formData, processor_details: e.target.value })}
                  placeholder="e.g., Intel Core i7-12700K"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="GPU Details">
                <input
                  type="text"
                  value={formData.gpu_details}
                  onChange={(e) => setFormData({ ...formData, gpu_details: e.target.value })}
                  placeholder="e.g., NVIDIA RTX 4070"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="RAM Details">
                <input
                  type="text"
                  value={formData.ram_details}
                  onChange={(e) => setFormData({ ...formData, ram_details: e.target.value })}
                  placeholder="e.g., 32GB DDR5"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Accessories">
                <input
                  type="text"
                  value={formData.accessories_details}
                  onChange={(e) => setFormData({ ...formData, accessories_details: e.target.value })}
                  placeholder="e.g., Mechanical Keyboard, Gaming Mouse"
                  style={inputStyle}
                />
              </FormField>
            </Section>

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                gap: 16,
                justifyContent: "flex-end",
                padding: "24px 0",
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <button
                onClick={() => router.push("/owner")}
                disabled={saving}
                style={{
                  padding: "14px 28px",
                  borderRadius: 10,
                  border: `1px solid ${colors.border}`,
                  background: "rgba(51,65,85,0.5)",
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDetails}
                disabled={saving || !formData.name || !formData.address}
                style={{
                  padding: "14px 28px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    saving || !formData.name || !formData.address
                      ? "rgba(34, 197, 94, 0.3)"
                      : "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving || !formData.name || !formData.address ? "not-allowed" : "pointer",
                  boxShadow:
                    saving || !formData.name || !formData.address
                      ? "none"
                      : "0 4px 16px rgba(34, 197, 94, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {saving ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Console Pricing Tab */}
        {activeTab === "pricing" && (
          <div>
            <Section title="Console Pricing Management" icon="💰">
              <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20 }}>
                Set custom pricing for each console type, quantity, and duration. Prices are automatically saved when you change them.
              </p>

              {CONSOLE_TYPES.map((console) => (
                <div
                  key={console.id}
                  style={{
                    padding: "20px",
                    background: "rgba(30,41,59,0.5)",
                    borderRadius: 12,
                    border: `1px solid ${colors.border}`,
                    marginBottom: 16,
                  }}
                >
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 24 }}>{console.icon}</span>
                    {console.label}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                    {[30, 60].map((duration) => (
                      <div key={duration} style={{ background: "rgba(15,23,42,0.5)", padding: "16px", borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.cyan, marginBottom: 12 }}>
                          {duration === 30 ? "30 Minutes" : "1 Hour"}
                        </div>
                        {Array.from({ length: console.maxQty }, (_, i) => i + 1).map((qty) => (
                          <div key={qty} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <label style={{ fontSize: 13, color: colors.textSecondary, minWidth: 80 }}>
                              {qty} Console{qty > 1 ? "s" : ""}:
                            </label>
                            <div style={{ position: "relative", flex: 1 }}>
                              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: colors.textMuted }}>
                                ₹
                              </span>
                              <input
                                type="number"
                                value={getPricingValue(console.id, qty, duration)}
                                onChange={(e) => updatePricing(console.id, qty, duration, parseInt(e.target.value) || 0)}
                                min="0"
                                step="10"
                                placeholder="0"
                                style={{
                                  ...inputStyle,
                                  paddingLeft: "28px",
                                  fontSize: 13,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}

        {/* Photo Gallery Tab */}
        {activeTab === "photos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Cover/Profile Photo Section */}
            <Section title="Cover Photo" icon="🖼️">
              <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 16 }}>
                This is the main photo displayed on your café page. Choose a high-quality image that represents your gaming café.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Current Cover Photo */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: colors.textSecondary, marginBottom: 8, display: "block" }}>
                    Current Cover Photo
                  </label>
                  {formData.cover_url ? (
                    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${colors.border}` }}>
                      <img
                        src={formData.cover_url}
                        alt="Cover"
                        style={{ width: "100%", height: 200, objectFit: "cover" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://via.placeholder.com/600x300?text=Cover+Photo";
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        height: 200,
                        borderRadius: 12,
                        border: `2px dashed ${colors.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: colors.textMuted,
                        fontSize: 14,
                      }}
                    >
                      No cover photo set
                    </div>
                  )}
                </div>

                {/* Update Cover Photo URL */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: colors.textSecondary, marginBottom: 8, display: "block" }}>
                    Update Cover Photo URL
                  </label>
                  <input
                    type="url"
                    value={formData.cover_url}
                    onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                    placeholder="https://example.com/cover.jpg"
                    style={{ ...inputStyle, marginBottom: 12 }}
                  />
                  <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                    Or select from your gallery photos below to set as cover
                  </p>
                </div>
              </div>
            </Section>

            {/* Gallery Photos Section */}
            <Section title="Photo Gallery" icon="📸">
              <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20 }}>
                Upload photos or add image URLs to showcase your gaming café to customers. These photos will appear in your café&apos;s gallery.
              </p>

              {/* Upload Options */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  {/* File Upload */}
                  <div style={{ flex: "1", minWidth: "250px" }}>
                    <label
                      htmlFor="image-upload"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "12px 24px",
                        borderRadius: 8,
                        border: `2px dashed ${colors.border}`,
                        background: uploadingImage ? "rgba(59, 130, 246, 0.1)" : "rgba(30,41,59,0.5)",
                        color: uploadingImage ? colors.cyan : colors.textSecondary,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: uploadingImage ? "not-allowed" : "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (!uploadingImage) {
                          e.currentTarget.style.borderColor = colors.cyan;
                          e.currentTarget.style.background = "rgba(0, 240, 255, 0.05)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = colors.border;
                        e.currentTarget.style.background = "rgba(30,41,59,0.5)";
                      }}
                    >
                      {uploadingImage ? (
                        <>
                          <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <span>📤</span>
                          Upload Photo (Max 5MB)
                        </>
                      )}
                    </label>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      style={{ display: "none" }}
                    />
                  </div>

                  {/* URL Input */}
                  <div style={{ flex: "2", minWidth: "300px", display: "flex", gap: 12 }}>
                    <input
                      type="url"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Or enter image URL (e.g., https://example.com/image.jpg)"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={handleAddImage}
                      disabled={!newImageUrl}
                      style={{
                        padding: "12px 24px",
                        borderRadius: 8,
                        border: "none",
                        background: newImageUrl ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "rgba(59, 130, 246, 0.3)",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: newImageUrl ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + Add URL
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: colors.textMuted, fontStyle: "italic" }}>
                  💡 Tip: Upload high-quality photos showing your gaming stations, ambiance, and facilities for best results.
                </p>
              </div>

              {/* Image Grid */}
              {cafeImages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: colors.textMuted }}>
                  <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📸</div>
                  <p style={{ fontSize: 16, marginBottom: 8 }}>No photos yet</p>
                  <p style={{ fontSize: 14 }}>Upload or add photos to showcase your café!</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
                  {cafeImages.map((image) => (
                    <div
                      key={image.id}
                      style={{
                        position: "relative",
                        borderRadius: 12,
                        overflow: "hidden",
                        border: `1px solid ${colors.border}`,
                        background: "rgba(30,41,59,0.5)",
                      }}
                    >
                      <img
                        src={image.image_url}
                        alt="Cafe Gallery"
                        style={{
                          width: "100%",
                          height: 200,
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x300?text=Image+Not+Found";
                        }}
                      />

                      {/* Action Buttons */}
                      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8 }}>
                        {/* Set as Cover Button */}
                        <button
                          onClick={() => handleUpdateCoverPhoto(image.image_url)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "none",
                            background: formData.cover_url === image.image_url ? "rgba(34, 197, 94, 0.9)" : "rgba(59, 130, 246, 0.9)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                          title={formData.cover_url === image.image_url ? "Current cover photo" : "Set as cover photo"}
                        >
                          {formData.cover_url === image.image_url ? "✓ Cover" : "🖼️ Set Cover"}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteImage(image.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "none",
                            background: "rgba(239, 68, 68, 0.9)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Delete photo"
                        >
                          🗑️
                        </button>
                      </div>

                      {/* Image URL */}
                      <div
                        style={{
                          padding: "12px",
                          fontSize: 11,
                          color: colors.textMuted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {image.image_url}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Helper Components
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.6)",
        borderRadius: 16,
        border: `1px solid ${colors.border}`,
        padding: "24px",
      }}
    >
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: colors.textPrimary,
        }}
      >
        <span style={{ fontSize: 24 }}>{icon}</span>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: colors.textSecondary,
        }}
      >
        {label}
        {required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: "rgba(30,41,59,0.5)",
  color: colors.textPrimary,
  fontSize: 14,
  fontFamily: fonts.body,
};
