"use client";

import dynamic from "next/dynamic";
import { fonts } from "@/lib/constants";
import { theme } from "../../../utils/theme";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const SettingsTab = dynamic(() => import("../SettingsTab"), { ssr: false });

export function SettingsTabRoute() {
  const {
    currentCafe,
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
  } = useOwnerDashboard();

  return (
    <ErrorBoundary>
      <SettingsTab
        theme={theme}
        fonts={fonts}
        cafes={currentCafe ? [currentCafe] : []}
        editedCafe={editedCafe}
        setEditedCafe={setEditedCafe}
        settingsChanged={settingsChanged}
        setSettingsChanged={setSettingsChanged}
        savingSettings={savingSettings}
        handleSaveSettings={handleSaveSettings}
        uploadingProfilePhoto={uploadingProfilePhoto}
        handleProfilePhotoUpload={handleProfilePhotoUpload}
        handleProfilePhotoDelete={handleProfilePhotoDelete}
        uploadingGalleryPhoto={uploadingGalleryPhoto}
        handleGalleryPhotoUpload={handleGalleryPhotoUpload}
        galleryImages={galleryImages}
        handleGalleryPhotoDelete={handleGalleryPhotoDelete}
      />
    </ErrorBoundary>
  );
}
