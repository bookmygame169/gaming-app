// src/components/CafeList.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import LiveAvailability from "@/components/LiveAvailability";
import type { Cafe, CafeListItem } from "@/types/cafe";
import {
  MapPin,
  Star,
  Clock,
  Gamepad2,
  GamepadDirectional,
  Monitor,
  DollarSign,
  RectangleGoggles,
  Target,
  MonitorPlay,
  Zap,
  ChevronRight,
  Sparkles,
  Users,
  Crown,
  Coffee,
  Wifi,
  Music,
  Shield,
  CheckCircle
} from "lucide-react";

type Props = {
  cafes: Cafe[];
};

export default function CafeList({ cafes }: Props) {
  if (!cafes || cafes.length === 0) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        /* Mobile-specific styles - SIMPLIFIED like WhatsApp image */
        @media (max-width: 768px) {
          .mobile-cafe-card {
            background: transparent;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            margin-bottom: 16px;
          }
          
          .mobile-cafe-image {
            height: 120px; /* Smaller compact height */
            position: relative;
            overflow: hidden;
            border-radius: 12px;
          }
          
          .mobile-cafe-image::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            /* A café's cover is almost always its logo: bright, high contrast,
               and centred exactly where the name sits. A single fade from 90%
               to transparent left the title competing with the artwork. Two
               stops hold it near-solid behind the text and let the picture
               through above it. */
            height: 78%;
            background: linear-gradient(
              to top,
              rgba(0, 0, 0, 0.97) 0%,
              rgba(0, 0, 0, 0.88) 34%,
              rgba(0, 0, 0, 0.35) 68%,
              transparent 100%
            );
          }
          
          .mobile-cafe-title {
            position: absolute;
            bottom: 30px; /* Moved up to make space for icons below */
            left: 12px;
            right: 12px;
            z-index: 2;
          }
          
          .mobile-cafe-title h3 {
            font-size: 16px;
            font-weight: 700;
            color: white;
            margin-bottom: 4px; /* Space for icons */
            line-height: 1.2;
          }
          
          /* Equipment icons were between title and location on image; hide on-image version */
          .mobile-icons-between {
            display: none;
          }
          
          .mobile-icon-item {
            display: flex;
            align-items: center;
            gap: 3px;
            padding: 2px 5px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.15);
          }
          
          .mobile-icon-label {
            font-size: 8px;
            color: rgba(255, 255, 255, 0.9);
            white-space: nowrap;
          }
          
          .mobile-icon-small {
            width: 10px;
            height: 10px;
            color: white;
          }
          
          .mobile-cafe-location {
            position: absolute;
            bottom: 8px; /* Moved down */
            left: 12px;
            right: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.8);
            z-index: 2;
          }
          
          .mobile-rating-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px);
            border-radius: 6px;
            padding: 4px 6px;
            display: flex;
            align-items: center;
            gap: 3px;
            z-index: 3;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .mobile-status-badge {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 3;
          }
          
          .mobile-divider {
            display: none;
          }

          /* New mobile equipment row and bottom bar */
          .mobile-equipment-row {
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            align-items: center;
            /* The free-now chip is added at the end of this row and would
               otherwise push the equipment icons off a 360px screen. */
            flex-wrap: wrap;
          }

          .mobile-bottom-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 12px 0 12px;
          }

          .mobile-price {
            background: rgba(255,255,255,0.03);
            padding: 6px 8px;
            border-radius: 999px;
            font-size: 13px;
            color: #fff;
          }

          .mobile-book-btn {
            background: linear-gradient(90deg, #ff073a, #ff6b7a);
            color: white;
            padding: 6px 10px;
            border-radius: 999px;
            font-weight: 700;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
        }
        
        /* Desktop styles remain the same */
        @media (min-width: 769px) {
          .cafe-card {
            background: linear-gradient(
              145deg,
              rgba(16, 16, 22, 0.9) 0%,
              rgba(10, 10, 15, 0.9) 100%
            );
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
            overflow: hidden;
          }

          .cafe-card:hover {
            border-color: rgba(255, 7, 58, 0.4);
            transform: translateY(-8px);
            box-shadow: 
              0 20px 60px rgba(0, 0, 0, 0.5),
              0 0 0 1px rgba(255, 7, 58, 0.2),
              0 0 60px rgba(255, 7, 58, 0.1);
          }
        }

        /* Common styles */
        .badge-open {
          background: linear-gradient(135deg, 
            rgba(34, 197, 94, 0.2) 0%,
            rgba(34, 197, 94, 0.1) 100%);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
        }

        .badge-closed {
          background: linear-gradient(135deg, 
            rgba(239, 68, 68, 0.2) 0%,
            rgba(239, 68, 68, 0.1) 100%);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }

        .badge-inactive {
          background: linear-gradient(135deg, 
            rgba(251, 191, 36, 0.2) 0%,
            rgba(251, 191, 36, 0.1) 100%);
          border: 1px solid rgba(251, 191, 36, 0.3);
          color: #fbbf24;
        }

        @keyframes pulse-glow {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(255, 7, 58, 0.3),
                        inset 0 0 10px rgba(255, 7, 58, 0.1);
          }
          50% { 
            box-shadow: 0 0 40px rgba(255, 7, 58, 0.5),
                        inset 0 0 20px rgba(255, 7, 58, 0.2);
          }
        }
      `}</style>

      {/* Desktop View */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-6 lg:gap-8">
        {cafes.map((cafe, index) => (
          <Link
            key={cafe.id}
            href={`/cafes/${cafe.slug || cafe.id}`}
            className="cafe-card group"
            style={{
              animationDelay: `${index * 0.05}s`,
            }}
          >
            {/* Desktop card content - your existing code */}
            {(cafe as CafeListItem).is_premium && (
              <div className="absolute top-4 right-4 z-20 premium-badge px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                <Crown className="w-3.5 h-3.5" />
                <span className="text-xs font-bold" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  PREMIUM
                </span>
              </div>
            )}

            <div className="relative h-64 lg:h-72 overflow-hidden">
              {cafe.cover_url ? (
                <>
                  <Image
                    src={cafe.cover_url}
                    alt={cafe.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    loading={index === 0 ? "eager" : "lazy"}
                    priority={index === 0}
                    quality={index === 0 ? 90 : index < 3 ? 80 : 70}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ff073a]/10 via-transparent to-[#00f0ff]/10 opacity-30" />

                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <OpeningBadge
                      openingHours={cafe.opening_hours}
                      isActive={cafe.is_active !== false}
                    />

                    {(cafe as CafeListItem).is_verified && (
                      <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#00f0ff]" />
                        <span className="text-xs font-medium text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Verified
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2
                          className="text-xl font-bold text-white mb-1"
                          style={{ fontFamily: 'Orbitron, sans-serif' }}
                        >
                          {cafe.name}
                        </h2>
                        <div className="flex items-center gap-1 text-zinc-300">
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {cafe.city || 'Location'}
                          </span>
                        </div>
                      </div>

                      {(cafe as CafeListItem).rating && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-xl">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <div className="flex flex-col">
                            <span className="text-lg font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                              {(cafe as CafeListItem).rating}
                            </span>
                            <span className="text-[10px] text-zinc-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Rating
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="relative h-full w-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center">
                  <div className="relative">
                    <Gamepad2 className="w-16 h-16 text-zinc-700 opacity-50" />
                  </div>

                  <div className="absolute top-4 left-4">
                    <OpeningBadge
                      openingHours={cafe.opening_hours}
                      isActive={cafe.is_active !== false}
                    />
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <h2
                      className="text-xl font-bold text-white mb-1"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      {cafe.name}
                    </h2>
                    <div className="flex items-center gap-1 text-zinc-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {cafe.address ? `${cafe.address.substring(0, 30)}...` : 'Location not specified'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-4">
                <FeatureChip icon={<Coffee className="w-3.5 h-3.5" />} label="Café" />
                <FeatureChip icon={<Wifi className="w-3.5 h-3.5" />} label="High-Speed WiFi" />
                <FeatureChip icon={<Users className="w-3.5 h-3.5" />} label="Tournaments" />
                <FeatureChip icon={<Music className="w-3.5 h-3.5" />} label="Ambience" />
              </div>

              <ConsoleIconsRow cafe={cafe} />

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {(cafe as CafeListItem).distance && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#00f0ff]" />
                      <span className="text-sm text-zinc-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {(cafe as CafeListItem).distance} km
                      </span>
                    </div>
                  )}

                  {(cafe as CafeListItem).popularity && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#ff073a]" />
                      <span className="text-sm text-zinc-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {(cafe as CafeListItem).popularity}+ playing now
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="price-tag rounded-2xl px-5 py-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-2xl font-bold text-white"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      ₹{cafe.hourly_price ?? 0}
                    </span>
                    <span
                      className="text-sm text-zinc-400"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      / hour
                    </span>
                  </div>
                  <div
                    className="text-xs text-zinc-500 mt-1"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Starting price
                  </div>
                </div>

                <button
                  className="book-btn rounded-2xl px-6 py-3.5 flex items-center gap-2 group"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/cafes/${cafe.slug || cafe.id}`;
                  }}
                >
                  <span
                    className="text-sm font-bold text-white flex items-center gap-2"
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    <Zap className="w-4 h-4 group-hover:scale-125 transition-transform" />
                    Book Now
                  </span>
                  <ChevronRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Mobile View - SIMPLIFIED like WhatsApp image */}
      <div className="block lg:hidden space-y-3">
        {cafes.map((cafe, index) => (
          <Link
            key={cafe.id}
            href={`/cafes/${cafe.slug || cafe.id}`}
            className="mobile-cafe-card"
          >
            {/* Image Section - All content on image */}
            <div className="mobile-cafe-image relative">
              {cafe.cover_url ? (
                <Image
                  src={cafe.cover_url}
                  alt={cafe.name}
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority={index < 3}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
              )}

              {/* Status Badge */}
              <div className="mobile-status-badge">
                <OpeningBadge
                  openingHours={cafe.opening_hours}
                  isActive={cafe.is_active !== false}
                />
              </div>

              {/* Rating Badge */}
              {(cafe as CafeListItem).rating && (
                <div className="mobile-rating-badge">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-xs font-semibold text-white">
                    {(cafe as CafeListItem).rating}
                  </span>
                </div>
              )}

              {/* Title */}
              <div className="mobile-cafe-title">
                <h3>{cafe.name}</h3>
              </div>

              {/* Location */}
              <div className="mobile-cafe-location">
                <MapPin className="w-3 h-3" />
                <span>{cafe.city || cafe.address?.split(',')[0] || 'Location'}</span>
              </div>
            </div>

            {/* Equipment icons moved below image to keep image area clean */}
            <div className="mobile-equipment-row">
              <EquipmentIconsMobile cafe={cafe} />
              {/* What is free, next to what they have. Renders nothing when
                  the café is full or has nothing to report, so a busy card
                  does not shout about being busy. */}
              <LiveAvailability cafeId={cafe.id} variant="compact" />
            </div>

            {/* Compact price + small Book button */}
            <div className="mobile-bottom-bar">
              <div className="mobile-price">₹{cafe.hourly_price ?? 0} / hr</div>
              <div>
                <button
                  className="mobile-book-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/cafes/${cafe.slug || cafe.id}`;
                  }}
                >
                  Book
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

/* ---------- Opening Badge ---------- */

function OpeningBadge({
  openingHours,
  isActive,
}: {
  openingHours?: string | null;
  isActive: boolean;
}) {
  if (!isActive) {
    return (
      <div className="badge-inactive inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]">
        <div className="relative">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
        </div>
        <span>Closed</span>
      </div>
    );
  }

  const range = parseOpeningRange(openingHours ?? undefined);

  if (!range) {
    return (
      <div className="badge-open inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]">
        <CheckCircle className="w-3 h-3" />
        <span>Open</span>
      </div>
    );
  }

  const now = new Date();
  const isOpen = now >= range.open && now <= range.close;

  if (isOpen) {
    return (
      <div className="badge-open inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]">
        <div className="relative">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </div>
        <span>Open Now</span>
      </div>
    );
  }

  return (
    <div className="badge-closed inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]">
      <Clock className="w-3 h-3" />
      <span>Closed</span>
    </div>
  );
}

/* ---------- Feature Chip ---------- */

function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="feature-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
      {icon}
      <span className="text-xs font-medium text-zinc-300" style={{ fontFamily: 'Inter, sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

/* ---------- Console Icons Row (Desktop) ---------- */

const CONSOLE_CONFIG: {
  key: keyof Cafe;
  icon: React.ReactNode;
  label: string;
  color: string;
}[] = [
    {
      key: "ps5_count",
      icon: <GamepadDirectional className="w-4 h-4" />,
      label: "PS5",
      color: "linear-gradient(135deg, rgba(0, 112, 243, 0.2) 0%, rgba(0, 112, 243, 0.1) 100%)"
    },
    {
      key: "ps4_count",
      icon: <Gamepad2 className="w-4 h-4" />,
      label: "PS4",
      color: "linear-gradient(135deg, rgba(0, 112, 243, 0.15) 0%, rgba(0, 112, 243, 0.08) 100%)"
    },
    {
      key: "xbox_count",
      icon: <Gamepad2 className="w-4 h-4 text-green-400" />,
      label: "Xbox",
      color: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.08) 100%)"
    },
    {
      key: "pc_count",
      icon: <Monitor className="w-4 h-4" />,
      label: "PC",
      color: "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%)"
    },
  ];

function ConsoleIconsRow({ cafe }: { cafe: Cafe }) {
  const available = CONSOLE_CONFIG.filter(
    ({ key }) => ((cafe[key] as number | null) ?? 0) > 0
  );

  if (available.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-[#00f0ff]" />
        <span className="text-sm font-semibold text-zinc-300" style={{ fontFamily: 'Inter, sans-serif' }}>
          Available Equipment
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map(({ key, icon, label, color }) => {
          const count = (cafe[key] as number | null) ?? 0;
          return (
            <div
              key={key}
              className="console-chip inline-flex items-center gap-2 rounded-xl px-3 py-2 group"
              style={{ background: color }}
            >
              <div className="text-zinc-300 group-hover:scale-110 transition-transform">
                {icon}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {label}
                </span>
                <span className="text-[10px] text-zinc-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {count} unit{count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mobile Equipment Icons (BETWEEN title and location) ---------- */

function EquipmentIconsMobile({ cafe }: { cafe: Cafe }) {
  // Simple small icons for mobile - displayed between title and location
  const mobileIcons = [
    {
      key: "ps5_count",
      icon: <GamepadDirectional className="mobile-icon-small" />,
      label: "PS5",
      show: ((cafe["ps5_count"] as number | null) ?? 0) > 0
    },
    {
      key: "ps4_count",
      icon: <Gamepad2 className="mobile-icon-small" />,
      label: "PS4",
      show: ((cafe["ps4_count"] as number | null) ?? 0) > 0
    },
    {
      key: "xbox_count",
      icon: <Gamepad2 className="mobile-icon-small" />,
      label: "Xbox",
      show: ((cafe["xbox_count"] as number | null) ?? 0) > 0
    },
    {
      key: "pc_count",
      icon: <Monitor className="mobile-icon-small" />,
      label: "PC",
      show: ((cafe["pc_count"] as number | null) ?? 0) > 0
    },
    {
      key: "pool_count",
      icon: <DollarSign className="mobile-icon-small" />,
      label: "Pool",
      show: ((cafe["pool_count"] as number | null) ?? 0) > 0
    },
    {
      key: "vr_count",
      icon: <RectangleGoggles className="mobile-icon-small" />,
      label: "VR",
      show: ((cafe["vr_count"] as number | null) ?? 0) > 0
    },
    {
      key: "arcade_count",
      icon: <MonitorPlay className="mobile-icon-small" />,
      label: "Arcade",
      show: ((cafe["arcade_count"] as number | null) ?? 0) > 0
    },
    {
      key: "snooker_count",
      icon: <Target className="mobile-icon-small" />,
      label: "Snooker",
      show: ((cafe["snooker_count"] as number | null) ?? 0) > 0
    },
  ];

  const availableIcons = mobileIcons.filter(item => item.show);

  if (availableIcons.length === 0) {
    return (
      <div className="mobile-icon-item">
        <Gamepad2 className="mobile-icon-small" />
        <span className="mobile-icon-label">No equipment</span>
      </div>
    );
  }

  // Show only first 3 icons to fit better between title and location
  const iconsToShow = availableIcons.slice(0, 3);

  return (
    <>
      {iconsToShow.map(({ key, icon, label }) => (
        <div key={key} className="mobile-icon-item">
          {icon}
          <span className="mobile-icon-label">{label}</span>
        </div>
      ))}

      {/* Show +X if there are more icons */}
      {availableIcons.length > 3 && (
        <div className="mobile-icon-item">
          <span className="mobile-icon-label">+{availableIcons.length - 3}</span>
        </div>
      )}
    </>
  );
}

/* ---------- Helper Functions ---------- */

function parseOpeningRange(
  openingHours?: string
): { open: Date; close: Date; label: string } | null {
  if (!openingHours) return null;

  const match = openingHours.match(
    /(\d{1,2}:\d{2}\s*(AM|PM))\s*[–-]\s*(\d{1,2}:\d{2}\s*(AM|PM))/i
  );
  if (!match) return null;

  const startStr = match[1];
  const endStr = match[3];
  const today = new Date();

  const open = parseTimeForToday(startStr, today);
  const close = parseTimeForToday(endStr, today);

  if (!open || !close) return null;

  return {
    open,
    close,
    label: `${startStr} – ${endStr}`,
  };
}

function parseTimeForToday(timeStr: string, baseDate: Date): Date | null {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const [timePart, ampmRaw] = parts;
  const [hStr, mStr] = timePart.split(":");
  const hourNum = Number(hStr);
  const minNum = Number(mStr);
  if (Number.isNaN(hourNum) || Number.isNaN(minNum)) return null;

  const ampm = ampmRaw.toUpperCase();
  let hour24 = hourNum % 12;
  if (ampm === "PM") hour24 += 12;

  const d = new Date(baseDate);
  d.setHours(hour24, minNum, 0, 0);
  return d;
}