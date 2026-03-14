import React from 'react';

type SettingsTabProps = {
  theme: any;
  fonts: any;
  cafes: any[];
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
  galleryImages: any[];
  handleGalleryPhotoDelete: (id: string, url: string) => void;
};

export default function SettingsTab({
  theme,
  fonts,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease-out" }}>
      {/* Café Information Section */}
      <div
        style={{
          background: theme.cardBackground,
          borderRadius: 16,
          border: `1px solid ${theme.border}`,
          padding: "32px",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🏢</span>
            <h2 style={{
              fontFamily: fonts.heading,
              fontSize: 24,
              margin: 0,
              color: theme.textPrimary,
              fontWeight: 700,
            }}>
              Café Information
            </h2>
          </div>
          <p style={{ fontSize: 14, color: theme.textSecondary, margin: 0 }}>
            Manage your café&apos;s basic information and contact details
          </p>
        </div>

        {cafe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Café Name */}
            <div>
              <label style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Café Name
              </label>
              <input
                type="text"
                value={cafe.name || ''}
                readOnly
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "rgba(15, 23, 42, 0.5)",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  color: theme.textPrimary,
                  fontSize: 15,
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
                fontSize: 13,
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
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
                  padding: "14px 16px",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  color: theme.textPrimary,
                  fontSize: 15,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: fonts.body,
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                    padding: "14px 16px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textPrimary,
                    fontSize: 15,
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                    padding: "14px 16px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textPrimary,
                    fontSize: 15,
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                fontSize: 13,
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
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
                  padding: "14px 16px",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  color: theme.textPrimary,
                  fontSize: 15,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: fonts.body,
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                background: settingsChanged ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.3)",
                border: "none",
                borderRadius: 10,
                color: settingsChanged ? "#ffffff" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "Saving..." : "Save Changes"}
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
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontSize: 18,
              margin: "0 0 4px 0",
              color: theme.textPrimary,
              fontWeight: 700,
            }}>
              Operational Hours
            </h2>
            <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
              Set your café&apos;s operating hours
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Operational Hours Section */}
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: theme.textPrimary,
                margin: "0 0 16px 0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Operational Hours
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Opening Time */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                background: settingsChanged ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.3)",
                border: "none",
                borderRadius: 10,
                color: settingsChanged ? "#ffffff" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Social Links & Pricing Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontSize: 18,
              margin: "0 0 4px 0",
              color: theme.textPrimary,
              fontWeight: 700,
            }}>
              Social Links & Pricing
            </h2>
            <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
              Add your social media links and pricing information
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Social Links Section */}
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: theme.textPrimary,
                margin: "0 0 16px 0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Social Links
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Google Maps URL */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                fontSize: 16,
                fontWeight: 700,
                color: theme.textPrimary,
                margin: "0 0 16px 0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Pricing
              </h3>

              <div>
                <label style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                    padding: "14px 16px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textPrimary,
                    fontSize: 15,
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                background: settingsChanged ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.3)",
                border: "none",
                borderRadius: 10,
                color: settingsChanged ? "#ffffff" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Device Specifications Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontSize: 18,
              margin: "0 0 4px 0",
              color: theme.textPrimary,
              fontWeight: 700,
            }}>
              Device Specifications
            </h2>
            <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
              Add details about your gaming equipment
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Device Specifications Section */}
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: theme.textPrimary,
                margin: "0 0 16px 0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Device Specifications
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Monitor Details */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
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
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: fonts.body,
                      transition: "all 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
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
                background: settingsChanged ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.3)",
                border: "none",
                borderRadius: 10,
                color: settingsChanged ? "#ffffff" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Photos Card */}
      {cafes.length > 0 && (
        <div
          style={{
            background: theme.cardBackground,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontSize: 18,
              margin: "0 0 4px 0",
              color: theme.textPrimary,
              fontWeight: 700,
            }}>
              Photos
            </h2>
            <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
              Upload your café&apos;s profile photo and gallery images
            </p>
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
                      borderRadius: 12,
                      border: `2px solid ${theme.border}`,
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{
                      padding: "12px 20px",
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      border: "none",
                      borderRadius: 12,
                      color: "#ffffff",
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
                        background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                        border: "none",
                        borderRadius: 12,
                        color: "#ffffff",
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
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `2px dashed ${theme.border}`,
                  borderRadius: 12,
                  cursor: uploadingProfilePhoto ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  opacity: uploadingProfilePhoto ? 0.5 : 1,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                    <p style={{ fontSize: 14, color: theme.textSecondary, margin: 0 }}>
                      {uploadingProfilePhoto ? "Uploading..." : "Upload Photo"}
                    </p>
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
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `2px dashed ${theme.border}`,
                  borderRadius: 12,
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
                      borderRadius: 12,
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
                        background: "rgba(239, 68, 68, 0.9)",
                        border: "none",
                        borderRadius: 8,
                        color: "#ffffff",
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
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.9)";
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
                background: settingsChanged ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.3)",
                border: "none",
                borderRadius: 10,
                color: settingsChanged ? "#ffffff" : theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: settingsChanged && !savingSettings ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: settingsChanged ? 1 : 0.5,
                alignSelf: "flex-end",
              }}
            >
              {savingSettings ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
