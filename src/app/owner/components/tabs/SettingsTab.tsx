import React from 'react';

type SettingsTabProps = {
  // Taken from the owner theme module rather than restated, so a colour that
  // is renamed there stops compiling here instead of rendering as undefined.
  theme: typeof import('../../utils/theme').theme;
  fonts: typeof import('@/lib/constants').fonts;
  // Only the first café, and only its name and cover, are read here.
  cafes: ReadonlyArray<{ name?: string | null; cover_url?: string | null }>;
  editedCafe: {
    address: string;
    phone: string;
    email: string;
    description: string;
    opening_time: string;
    closing_time: string;
    google_maps_url: string;
    instagram_url: string;
    price_starts_from: string;
    monitor_details: string;
    processor_details: string;
    gpu_details: string;
    ram_details: string;
    accessories_details: string;
  };
  setEditedCafe: React.Dispatch<React.SetStateAction<{
    address: string;
    phone: string;
    email: string;
    description: string;
    opening_time: string;
    closing_time: string;
    google_maps_url: string;
    instagram_url: string;
    price_starts_from: string;
    monitor_details: string;
    processor_details: string;
    gpu_details: string;
    ram_details: string;
    accessories_details: string;
  }>>;
  settingsChanged: boolean;
  setSettingsChanged: React.Dispatch<React.SetStateAction<boolean>>;
  savingSettings: boolean;
  handleSaveSettings: () => void;
  uploadingProfilePhoto: boolean;
  handleProfilePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleProfilePhotoDelete: () => void;
  uploadingGalleryPhoto: boolean;
  handleGalleryPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  galleryImages: Array<{ id: string; image_url: string }>;
  handleGalleryPhotoDelete: (id: string, url: string) => void;
};

export default function SettingsTab({
  theme,
  cafes,
  editedCafe,
  setEditedCafe,
  settingsChanged,
  setSettingsChanged,
  savingSettings,
  handleSaveSettings,
  uploadingProfilePhoto,
  handleProfilePhotoUpload,
  handleProfilePhotoDelete,
  uploadingGalleryPhoto,
  handleGalleryPhotoUpload,
  galleryImages,
  handleGalleryPhotoDelete,
}: SettingsTabProps) {
  const [cafe] = cafes;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease-out", paddingBottom: settingsChanged ? 80 : 0 }}>
      {/* Sticky save bar */}
      {settingsChanged && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 border-t border-[#f2f0ea]/10 bg-[#0b0b0c]/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-[#ff5c2b]">
            <span className="h-2 w-2 shrink-0 animate-pulse bg-[#ff5c2b]" />
            <span className="font-medium">Unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSettingsChanged(false)}
              className="border border-[#f2f0ea]/[0.18] px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#f2f0ea]/[0.72] transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
            >
              Discard
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="flex items-center gap-2 bg-[#d8ff3c] px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] font-semibold text-[#0b0b0c] transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingSettings ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />SAVING…</>
              ) : 'SAVE'}
            </button>
          </div>
        </div>
      )}
      {/* Café Information Section */}
      <div
        style={{
          background: theme.cardBackground,
          border: `1px solid ${theme.border}`,
          padding: "32px",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(242,240,234,.5)", fontWeight: 500 }}>
              Café Information
            </h2>
          </div>
        </div>

        {cafe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Café Name */}
            <div>
              <label style={{
                display: "block",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}>
                Café Name
              </label>
              <input
                type="text"
                value={cafe.name || ''}
                readOnly
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  background: "#0e0e10",
                  border: `1px solid ${theme.border}`,
                  color: theme.textPrimary,
                  fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                  outline: "none",
                  cursor: "not-allowed",
                  opacity: 0.7,
                }}
              />
              <p style={{ fontSize: 12, color: theme.textMuted, margin: "6px 0 0 0" }}>
                Contact support to change your café name
              </p>
            </div>

            {/* Address */}
            <div>
              <label style={{
                display: "block",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}>
                Address
              </label>
              <textarea
                value={editedCafe?.address || ''}
                onChange={(e) => {
                  setEditedCafe((prev) => ({ ...prev, address: e.target.value }));
                  setSettingsChanged(true);
                }}
                rows={3}
                placeholder="Enter café address"
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  background: "#0e0e10",
                  border: `1px solid ${theme.border}`,
                  color: theme.textPrimary,
                  fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                  outline: "none",
                  resize: "vertical",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#d8ff3c";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = theme.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Contact Information Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Phone */}
              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editedCafe?.phone || ''}
                  onChange={(e) => {
                    setEditedCafe((prev) => ({ ...prev, phone: e.target.value }));
                    setSettingsChanged(true);
                  }}
                  placeholder="Enter phone number"
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    background: "#0e0e10",
                    border: `1px solid ${theme.border}`,
                    color: theme.textPrimary,
                    fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#d8ff3c";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={editedCafe?.email || ''}
                  onChange={(e) => {
                    setEditedCafe((prev) => ({ ...prev, email: e.target.value }));
                    setSettingsChanged(true);
                  }}
                  placeholder="Enter email address"
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    background: "#0e0e10",
                    border: `1px solid ${theme.border}`,
                    color: theme.textPrimary,
                    fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#d8ff3c";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{
                display: "block",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}>
                Description
              </label>
              <textarea
                value={editedCafe?.description || ''}
                onChange={(e) => {
                  setEditedCafe((prev) => ({ ...prev, description: e.target.value }));
                  setSettingsChanged(true);
                }}
                rows={4}
                placeholder="Describe your gaming café..."
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  background: "#0e0e10",
                  border: `1px solid ${theme.border}`,
                  color: theme.textPrimary,
                  fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                  outline: "none",
                  resize: "vertical",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#d8ff3c";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = theme.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Save Button for Café Information */}
            <button
              onClick={handleSaveSettings}
              disabled={!settingsChanged || savingSettings}
              style={{
                padding: "14px 20px",
                background: settingsChanged ? "#d8ff3c" : "rgba(242,240,234,0.08)",
                border: "none",
                color: settingsChanged ? "#0b0b0c" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE"}
            </button>
          </div>
        )}

        {cafes.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🏢</div>
            <p style={{ fontSize: 16, color: theme.textSecondary }}>
              No café information available
            </p>
          </div>
        )}
      </div>

      {/* Operational Hours Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              margin: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(242,240,234,.5)",
              fontWeight: 500,
            }}>
              Operational Hours
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Operational Hours Section */}
            <div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Opening Time */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Opening Time
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.opening_time || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, opening_time: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="09:00 AM"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Closing Time */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Closing Time
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.closing_time || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, closing_time: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="11:00 PM"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Save Button for Operational Hours */}
            <button
              onClick={handleSaveSettings}
              disabled={!settingsChanged || savingSettings}
              style={{
                padding: "14px 20px",
                background: settingsChanged ? "#d8ff3c" : "rgba(242,240,234,0.08)",
                border: "none",
                color: settingsChanged ? "#0b0b0c" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}

      {/* Social Links & Pricing Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              margin: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(242,240,234,.5)",
              fontWeight: 500,
            }}>
              Social Links & Pricing
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Social Links Section */}
            <div>
              <h3 style={{
                margin: "0 0 14px 0",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(242,240,234,.5)",
                fontWeight: 500,
              }}>
                Social Links
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Google Maps URL */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Google Maps URL
                  </label>
                  <input
                    type="url"
                    value={editedCafe?.google_maps_url || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, google_maps_url: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="https://maps.google.com/..."
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Instagram URL */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={editedCafe?.instagram_url || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, instagram_url: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="https://instagram.com/..."
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div>
              <h3 style={{
                margin: "0 0 14px 0",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(242,240,234,.5)",
                fontWeight: 500,
              }}>
                Pricing
              </h3>

              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                }}>
                  Price Starts From (₹)
                </label>
                <input
                  type="number"
                  value={editedCafe?.price_starts_from || ''}
                  onChange={(e) => {
                    setEditedCafe((prev) => ({ ...prev, price_starts_from: e.target.value }));
                    setSettingsChanged(true);
                  }}
                  placeholder="50"
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    background: "#0e0e10",
                    border: `1px solid ${theme.border}`,
                    color: theme.textPrimary,
                    fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#d8ff3c";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <p style={{ fontSize: 12, color: theme.textMuted, margin: "6px 0 0 0" }}>
                  Display starting price for your services (e.g., ₹50/hour)
                </p>
              </div>
            </div>

            {/* Save Button for Social Links & Pricing */}
            <button
              onClick={handleSaveSettings}
              disabled={!settingsChanged || savingSettings}
              style={{
                padding: "14px 20px",
                background: settingsChanged ? "#d8ff3c" : "rgba(242,240,234,0.08)",
                border: "none",
                color: settingsChanged ? "#0b0b0c" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}

      {/* Device Specifications Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              margin: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(242,240,234,.5)",
              fontWeight: 500,
            }}>
              Device Specifications
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Device Specifications Section */}
            <div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Monitor Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Monitor Details
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.monitor_details || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, monitor_details: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="e.g., 27-inch 144Hz Gaming Monitor"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Processor Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Processor Details
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.processor_details || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, processor_details: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="e.g., Intel Core i7-12700K"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* GPU Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    GPU Details
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.gpu_details || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, gpu_details: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="e.g., NVIDIA RTX 4070"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* RAM Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    RAM Details
                  </label>
                  <input
                    type="text"
                    value={editedCafe?.ram_details || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, ram_details: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    placeholder="e.g., 32GB DDR5"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Accessories Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "rgba(242,240,234,.4)",
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                  }}>
                    Accessories Details
                  </label>
                  <textarea
                    value={editedCafe?.accessories_details || ''}
                    onChange={(e) => {
                      setEditedCafe((prev) => ({ ...prev, accessories_details: e.target.value }));
                      setSettingsChanged(true);
                    }}
                    rows={3}
                    placeholder="e.g., Mechanical Keyboard, Gaming Mouse, Headset"
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      background: "#0e0e10",
                      border: `1px solid ${theme.border}`,
                      color: theme.textPrimary,
                      fontSize: 12.5,
                  fontFamily: "var(--font-plex-mono), monospace",
                      outline: "none",
                      resize: "vertical",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#d8ff3c";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(216,255,60,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Save Button for Device Specifications */}
            <button
              onClick={handleSaveSettings}
              disabled={!settingsChanged || savingSettings}
              style={{
                padding: "14px 20px",
                background: settingsChanged ? "#d8ff3c" : "rgba(242,240,234,0.08)",
                border: "none",
                color: settingsChanged ? "#0b0b0c" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}

      {/* Photos Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              margin: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(242,240,234,.5)",
              fontWeight: 500,
            }}>
              Photos
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Profile Photo */}
            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Profile Photo
              </label>

              {cafe.cover_url ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <img
                    src={cafe.cover_url}
                    alt="Profile"
                    style={{
                      width: 200,
                      height: 200,
                      objectFit: "cover",
                      border: `2px solid ${theme.border}`,
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{
                      padding: "12px 20px",
                      background: "#d8ff3c",
                      border: "none",
                      color: "#0b0b0c",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: uploadingProfilePhoto ? "not-allowed" : "pointer",
                      textAlign: "center",
                      transition: "all 0.2s",
                      opacity: uploadingProfilePhoto ? 0.5 : 1,
                    }}>
                      {uploadingProfilePhoto ? "Uploading..." : "Change Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoUpload}
                        disabled={uploadingProfilePhoto}
                        style={{ display: "none" }}
                      />
                    </label>
                    <button
                      onClick={handleProfilePhotoDelete}
                      style={{
                        padding: "12px 20px",
                        background: "#111113",
                        border: "none",
                        color: "#0b0b0c",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      Delete Photo
                    </button>
                  </div>
                </div>
              ) : (
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 200,
                  height: 200,
                  background: "#0e0e10",
                  border: `2px dashed ${theme.border}`,
                  cursor: uploadingProfilePhoto ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  opacity: uploadingProfilePhoto ? 0.5 : 1,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePhotoUpload}
                    disabled={uploadingProfilePhoto}
                    style={{ display: "none" }}
                  />
                </label>
              )}
              <p style={{ fontSize: 12, color: theme.textMuted, margin: "8px 0 0 0" }}>
                Recommended: Square image, at least 400x400px
              </p>
            </div>

            {/* Gallery Photos */}
            <div>
              <label style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Gallery Photos
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
                {/* Upload Button */}
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  aspectRatio: "1",
                  background: "#0e0e10",
                  border: `2px dashed ${theme.border}`,
                  cursor: uploadingGalleryPhoto ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  opacity: uploadingGalleryPhoto ? 0.5 : 1,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 4 }}>+</div>
                    <p style={{ fontSize: 12, color: theme.textSecondary, margin: 0 }}>
                      {uploadingGalleryPhoto ? "Uploading..." : "Add Photo"}
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryPhotoUpload}
                    disabled={uploadingGalleryPhoto}
                    style={{ display: "none" }}
                  />
                </label>

                {/* Gallery Images */}
                {galleryImages.map((image) => (
                  <div
                    key={image.id}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      overflow: "hidden",
                      border: `2px solid ${theme.border}`,
                    }}
                  >
                    <img
                      src={image.image_url}
                      alt="Gallery"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <button
                      onClick={() => handleGalleryPhotoDelete(image.id, image.image_url)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 32,
                        height: 32,
                        background: "rgba(255, 92, 43, 0.9)",
                        border: "none",
                        color: "#0b0b0c",
                        fontSize: 16,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(220, 38, 38, 1)";
                        e.currentTarget.style.transform = "scale(1.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 92, 43, 0.9)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: theme.textMuted, margin: "8px 0 0 0" }}>
                Add up to 10 photos to showcase your gaming café
              </p>
            </div>

            {/* Save Button for Photos */}
            <button
              onClick={handleSaveSettings}
              disabled={!settingsChanged || savingSettings}
              style={{
                padding: "14px 20px",
                background: settingsChanged ? "#d8ff3c" : "rgba(242,240,234,0.08)",
                border: "none",
                color: settingsChanged ? "#0b0b0c" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
