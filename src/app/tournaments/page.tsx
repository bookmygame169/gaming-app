// src/app/tournaments/page.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Trophy,
  Users,
  Calendar,
  MapPin,
  DollarSign,
  Target,
  Clock,
  Gamepad2,
  ChevronRight,
  Flame,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { colors, fonts } from "@/lib/constants";

type Tournament = {
  id: string;
  name: string;
  game: string;
  icon: string;
  status: string;
  tournament_date: string;
  tournament_time: string;
  prize_amount: number;
  prize_currency: string;
  max_participants: number;
  current_participants: number;
  location: string;
  description: string;
  color: string;
};

export default function TournamentsPage() {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch tournaments from API
  useEffect(() => {
    async function fetchTournaments() {
      try {
        const response = await fetch("/api/tournaments");
        if (!response.ok) {
          throw new Error("Failed to fetch tournaments");
        }
        const data = await response.json();
        setTournaments(data.tournaments || []);
      } catch (err) {
        console.error("Error fetching tournaments:", err);
        setError("Failed to load tournaments");
      } finally {
        setLoading(false);
      }
    }
    fetchTournaments();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTournament(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleRegister = async (tournament: Tournament) => {
    // For now, show alert - in production, integrate with registration API
    alert(
      `Tournament registration coming soon!\n\nTournament: ${tournament.name}\nGame: ${tournament.game}\nDate: ${tournament.tournament_date}`
    );
  };

  return (
    <>
      <style jsx global>{`
        .tournaments-page {
          min-height: 100vh;
          background: linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%);
          font-family: ${fonts.body};
          color: ${colors.textPrimary};
          position: relative;
        }

        .tournaments-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px 16px;
          position: relative;
          z-index: 1;
        }

        .page-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
          padding-top: 16px;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid ${colors.border};
          color: ${colors.textSecondary};
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .back-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateX(-2px);
        }

        .header-content {
          flex: 1;
        }

        .header-title {
          font-family: ${fonts.heading};
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px 0;
          background: linear-gradient(135deg, ${colors.red} 0%, ${colors.cyan} 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-subtitle {
          color: ${colors.textSecondary};
          font-size: 14px;
          margin: 0;
        }

        .tournaments-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .tournament-card {
          background: linear-gradient(135deg, rgba(255, 7, 58, 0.08) 0%, ${colors.darkCard} 100%);
          border: 1px solid ${colors.border};
          border-radius: 16px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .tournament-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--card-color), transparent);
          --card-color: ${colors.red};
        }

        .tournament-card:hover {
          transform: translateY(-8px);
          border-color: ${colors.red};
          box-shadow: 0 20px 60px rgba(255, 7, 58, 0.15);
        }

        .card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .card-icon-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .card-icon {
          font-size: 28px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 7, 58, 0.1);
          border-radius: 10px;
        }

        .card-title-section {
          flex: 1;
        }

        .card-title {
          font-family: ${fonts.heading};
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: ${colors.textPrimary};
        }

        .card-game {
          font-size: 12px;
          color: ${colors.textSecondary};
          margin: 0;
        }

        .card-status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: inline-block;
        }

        .card-status-badge.upcoming {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .card-status-badge.ongoing {
          background: rgba(255, 193, 7, 0.2);
          color: #ffc107;
          border: 1px solid rgba(255, 193, 7, 0.3);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(255, 193, 7, 0); }
        }

        .card-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0;
          padding: 12px 0;
          border-top: 1px solid ${colors.border};
          border-bottom: 1px solid ${colors.border};
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stat-icon {
          width: 16px;
          height: 16px;
          color: ${colors.cyan};
          flex-shrink: 0;
        }

        .stat-text {
          font-size: 12px;
          color: ${colors.textSecondary};
        }

        .card-prize {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid ${colors.border};
        }

        .prize-label {
          font-size: 11px;
          color: ${colors.textMuted};
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }

        .prize-amount {
          font-family: ${fonts.heading};
          font-size: 20px;
          font-weight: 700;
          color: ${colors.cyan};
        }

        .card-cta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid ${colors.border};
          color: ${colors.cyan};
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .card-cta:hover {
          gap: 12px;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }

        .modal-content {
          background: linear-gradient(135deg, rgba(255, 7, 58, 0.1) 0%, ${colors.darkCard} 100%);
          border: 1px solid ${colors.border};
          border-radius: 20px;
          padding: 32px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .modal-title {
          font-family: ${fonts.heading};
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: ${colors.textPrimary};
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: ${colors.textSecondary};
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: rgba(255, 7, 58, 0.2);
          color: ${colors.red};
        }

        .modal-details {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .modal-section {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .modal-section-icon {
          width: 24px;
          height: 24px;
          color: ${colors.cyan};
          flex-shrink: 0;
          margin-top: 2px;
        }

        .modal-section-content h4 {
          font-size: 13px;
          color: ${colors.textMuted};
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 6px 0;
          font-weight: 600;
        }

        .modal-section-content p {
          font-size: 14px;
          color: ${colors.textPrimary};
          margin: 0;
          line-height: 1.5;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid ${colors.border};
        }

        .btn-primary {
          flex: 1;
          padding: 14px 20px;
          background: linear-gradient(135deg, ${colors.red} 0%, #ff3366 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-family: ${fonts.heading};
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 7, 58, 0.3);
        }

        .btn-secondary {
          flex: 1;
          padding: 14px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid ${colors.border};
          border-radius: 12px;
          color: ${colors.textPrimary};
          font-family: ${fonts.heading};
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: ${colors.red};
        }

        @media (max-width: 768px) {
          .tournaments-grid {
            grid-template-columns: 1fr;
          }

          .header-title {
            font-size: 24px;
          }

          .modal-content {
            padding: 24px;
          }

          .modal-actions {
            flex-direction: column;
          }
        }
      `}</style>

      <div className="tournaments-page">
        <div className="tournaments-container">
          {/* Header */}
          <header className="page-header">
            <div className="header-content">
              <h1 className="header-title">
                <Trophy className="w-8 h-8 inline mr-2" />
                Gaming Tournaments
              </h1>
              <p className="header-subtitle">Compete, Win, and Become a Champion!</p>
            </div>
          </header>

          {/* Tournaments Grid */}
          {loading ? (
            <div className="tournaments-grid">
              <SkeletonList count={3} lines={3} />
            </div>
          ) : error ? (
            <div className="tournaments-grid">
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
                <p style={{ color: colors.red }}>{error}</p>
              </div>
            </div>
          ) : tournaments.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No tournaments right now"
              message="Cafés run these every few weeks. Check back, or ask yours when the next one is."
              action={{ label: "Browse cafés", href: "/" }}
            />
          ) : (
            <div className="tournaments-grid">
              {tournaments.map((tournament) => (
                <div
                  key={tournament.id}
                  className="tournament-card"
                  style={{
                    "--card-color": tournament.color,
                  } as React.CSSProperties}
                  onClick={() => setSelectedTournament(tournament)}
                >
                  {/* Header */}
                  <div className="card-header">
                    <div className="card-icon-title">
                      <div className="card-icon">{tournament.icon}</div>
                      <div className="card-title-section">
                        <h3 className="card-title">{tournament.name}</h3>
                        <p className="card-game">{tournament.game}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className={`card-status-badge ${tournament.status.toLowerCase()}`}>
                    {tournament.status.toLowerCase() === "ongoing" && <Flame className="w-3 h-3 inline mr-1" />}
                    {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
                  </div>

                  {/* Stats */}
                  <div className="card-stats">
                    <div className="stat-item">
                      <Calendar className="stat-icon" />
                      <span className="stat-text">{new Date(tournament.tournament_date).toLocaleDateString()}</span>
                    </div>
                    <div className="stat-item">
                      <Users className="stat-icon" />
                      <span className="stat-text">{tournament.current_participants}/{tournament.max_participants}</span>
                    </div>
                    <div className="stat-item">
                      <Clock className="stat-icon" />
                      <span className="stat-text">{tournament.tournament_time}</span>
                    </div>
                    <div className="stat-item">
                      <MapPin className="stat-icon" />
                      <span className="stat-text">{tournament.location}</span>
                    </div>
                  </div>

                  {/* Prize */}
                  <div className="card-prize">
                    <div className="prize-label">Prize Pool</div>
                    <div className="prize-amount">{tournament.prize_currency}{tournament.prize_amount.toLocaleString()}</div>
                  </div>

                  {/* CTA */}
                  <div className="card-cta">
                    <span>Register Now</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal */}
        {selectedTournament && (
          <div className="modal-overlay" onClick={() => setSelectedTournament(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{selectedTournament.name}</h2>
                <button
                  className="close-btn"
                  onClick={() => setSelectedTournament(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-details">
                <div className="modal-section">
                  <Gamepad2 className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>Game</h4>
                    <p>{selectedTournament.game}</p>
                  </div>
                </div>

                <div className="modal-section">
                  <Target className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>About</h4>
                    <p>{selectedTournament.description}</p>
                  </div>
                </div>

                <div className="modal-section">
                  <DollarSign className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>Prize Pool</h4>
                    <p style={{ fontSize: "18px", fontWeight: "700", color: colors.cyan }}>
                      {selectedTournament.prize_currency}{selectedTournament.prize_amount.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="modal-section">
                  <Users className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>Participants</h4>
                    <p>{selectedTournament.current_participants} / {selectedTournament.max_participants}</p>
                  </div>
                </div>

                <div className="modal-section">
                  <Calendar className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>Date & Time</h4>
                    <p>
                      {new Date(selectedTournament.tournament_date).toLocaleDateString()} at {selectedTournament.tournament_time}
                    </p>
                  </div>
                </div>

                <div className="modal-section">
                  <MapPin className="modal-section-icon" />
                  <div className="modal-section-content">
                    <h4>Location</h4>
                    <p>{selectedTournament.location}</p>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  className="btn-primary"
                  onClick={() => handleRegister(selectedTournament)}
                  disabled={selectedTournament.current_participants >= selectedTournament.max_participants}
                >
                  <Trophy className="w-4 h-4" />
                  {selectedTournament.current_participants >= selectedTournament.max_participants
                    ? "Tournament Full"
                    : "Register Now"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setSelectedTournament(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
