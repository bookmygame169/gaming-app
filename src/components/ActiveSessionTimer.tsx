"use client";

import { useEffect, useState } from "react";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { Timer, Zap, ChevronRight, Gamepad2, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/hooks/useUser";

// Demo mode allows testing the UI without a real booking
const DEMO_MODE = false;

// Shares the one parser in timeUtils; only the shape differs, because the
// countdown below wants hours and minutes rather than minutes from midnight.
function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
    const total = parseTimeToMinutes(timeStr);
    if (total === null) return null;
    return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export default function ActiveSessionTimer() {
    const router = useRouter();
    const { user, loading: userLoading } = useUser();
    const [activeBooking, setActiveBooking] = useState<any>(null);
    const [endTime, setEndTime] = useState<Date | null>(null);
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [timeLeft, setTimeLeft] = useState<string>("");
    const [progress, setProgress] = useState(100);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchActiveSession() {
            // Wait for auth to resolve and require logged-in user
            if (userLoading) {
                return; // Still loading auth, wait
            }
            if (!user) {
                setActiveBooking(null);
                setLoading(false);
                return;
            }

            try {
                // Use local date YYYY-MM-DD
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                const todayStr = `${yyyy}-${mm}-${dd}`;

                // Find bookings for TODAY with status in-progress or confirmed
                const { data, error } = await supabase
                    .from("bookings")
                    .select("*, cafes(name, city), booking_items(console, title)")
                    .eq("user_id", user.id)
                    .eq("booking_date", todayStr);

                if (error) {
                    console.error("Error fetching bookings:", error);
                    setLoading(false);
                    return;
                }

                if (data && data.length > 0) {
                    const currentTimeMs = now.getTime();

                    const active = data.find((b: any) => {
                        // Check Status (case insensitive)
                        const status = (b.status || '').toLowerCase();
                        // Only show in-progress or confirmed sessions
                        if (status === 'cancelled' || status === 'completed') return false;

                        if (!b.start_time) return false;

                        const parsedStart = parseTimeString(b.start_time);
                        if (!parsedStart) return false;

                        // Create start time Date object
                        const sessionStart = new Date();
                        sessionStart.setHours(parsedStart.hours, parsedStart.minutes, 0, 0);

                        // Calculate end time
                        let sessionEnd: Date;

                        if (b.end_time) {
                            // Online booking with explicit end_time
                            const parsedEnd = parseTimeString(b.end_time);
                            if (!parsedEnd) return false;

                            sessionEnd = new Date();
                            sessionEnd.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);

                            // Handle midnight crossing
                            if (sessionEnd.getTime() < sessionStart.getTime()) {
                                sessionEnd.setDate(sessionEnd.getDate() + 1);
                            }
                        } else if (b.duration) {
                            // Walk-in booking with duration (in minutes)
                            sessionEnd = new Date(sessionStart.getTime() + b.duration * 60 * 1000);
                        } else {
                            // No end_time or duration, skip
                            return false;
                        }

                        // Check if NOW is within the session time
                        const isActive = currentTimeMs >= sessionStart.getTime() && currentTimeMs < sessionEnd.getTime();

                        if (isActive) {
                            // Store the calculated times for the timer
                            b._calculatedStart = sessionStart;
                            b._calculatedEnd = sessionEnd;
                        }

                        return isActive;
                    });

                    if (active) {
                        setActiveBooking(active);
                        setStartTime(active._calculatedStart);
                        setEndTime(active._calculatedEnd);
                    }
                }
            } catch (err) {
                console.error("Error fetching active session:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchActiveSession();
        // Refresh every minute
        const interval = setInterval(fetchActiveSession, 60000);
        return () => clearInterval(interval);
    }, [user, userLoading]);

    // Timer Logic
    useEffect(() => {
        if (!activeBooking || !startTime || !endTime) return;

        const calculateTime = () => {
            const now = new Date();

            // Total duration in MS
            const totalDurationMs = endTime.getTime() - startTime.getTime();
            // Time remaining in MS
            const diffMs = endTime.getTime() - now.getTime();

            // If session finished
            if (diffMs <= 0) {
                setTimeLeft("00:00");
                setProgress(0);
                return;
            }

            // Progress: Percentage of time remaining (draining battery effect)
            const pct = Math.max(0, Math.min(100, (diffMs / totalDurationMs) * 100));
            setProgress(pct);

            // Format HH:MM:SS
            const h = Math.floor(diffMs / (1000 * 60 * 60));
            const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diffMs % (1000 * 60)) / 1000);

            if (h > 0) {
                setTimeLeft(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else {
                setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);

        return () => clearInterval(interval);
    }, [activeBooking, startTime, endTime]);

    // Don't render if: still loading auth, no user logged in, or no active booking
    if (userLoading || loading || !user || !activeBooking) return null;

    return (
        <div className="w-full max-w-7xl mx-auto px-4 mb-6 relative z-40 animate-slide-up">
            <div className="relative overflow-hidden rounded-2xl border border-[#00f0ff]/30 bg-[#0a0a10]/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,240,255,0.15)]">

                {/* Animated Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff]/10 via-transparent to-[#ff073a]/10 animate-pulse"></div>

                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 h-1 bg-[#101016] w-full">
                    <div
                        className="h-full bg-gradient-to-r from-[#00f0ff] to-[#ff073a] transition-all duration-1000 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="relative p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4">

                    {/* Left Side: Status & Info */}
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {/* Live Pulse Icon */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-[#00f0ff] rounded-full animate-ping opacity-20"></div>
                            <div className="relative w-12 h-12 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff]">
                                <Clock className="w-6 h-6 animate-pulse" />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse"></span>
                                    Live Session
                                </span>
                                {activeBooking.source === 'walk_in' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                        Walk-in
                                    </span>
                                )}
                            </div>
                            <h3 className="text-white font-bold text-lg md:text-xl leading-none mb-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                                {activeBooking.cafes?.name || activeBooking.cafe?.name || "Gaming Café"}
                            </h3>
                            <p className="text-zinc-400 text-xs md:text-sm flex items-center gap-1.5">
                                <Gamepad2 className="w-3.5 h-3.5" />
                                <span className="capitalize">
                                    {activeBooking.booking_items?.[0]?.console || activeBooking.console_type || "Gaming"}
                                </span>
                                {startTime && endTime && (
                                    <> • {startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} - {endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Center: Timer (Big & Bold) */}
                    <div className="flex flex-col items-center">
                        <div className="text-zinc-500 text-[10px] uppercase tracking-[3px] font-bold mb-1">Time Remaining</div>
                        <div className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 tabular-nums tracking-tight" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                            {timeLeft || "Loading..."}
                        </div>
                    </div>

                    {/* Right Side: Action Button */}
                    <div className="w-full md:w-auto mt-2 md:mt-0">
                        <button
                            onClick={() => router.push(`/bookings/${activeBooking.id}`)}
                            className="w-full md:w-auto group relative flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]"
                        >
                            <Zap className="w-4 h-4 text-[#00f0ff] group-hover:text-white transition-colors" />
                            <span className="text-[#00f0ff] group-hover:text-white font-bold uppercase tracking-wider text-sm transition-colors">
                                Manage Session
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#00f0ff]/50 group-hover:text-white/50 group-hover:translate-x-1 transition-all" />
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
