'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Chips,
    EmptyRow,
    Field,
    GhostButton,
    Kpis,
    Panel,
    PrimaryButton,
    SectionBar,
    TableHead,
    TableRow,
} from './consoleUi';
import { LoyaltyRewardsMenu, type Reward } from './LoyaltyRewardsMenu';

type Settings = {
    enabled: boolean;
    minDailySpend: number;
    pointsPerDay: number;
    rupeesPerPoint: number;
    minRedeemPoints: number;
};

type Member = {
    phone: string;
    name: string | null;
    balance: number;
    earned: number;
    redeemed: number;
    worthRupees: number;
    lastActivity: string;
};

type RecentEntry = {
    id: string;
    phone: string;
    points: number;
    reason: string;
    note: string | null;
    createdAt: string;
};

interface OwnerLoyaltyProps {
    cafeId?: string;
}

const REASON_LABELS: Record<string, string> = {
    booking: 'Session',
    redeemed: 'Used',
    manual: 'Adjusted',
    bonus: 'Bonus',
    expired: 'Expired',
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Loyalty points for one café: the rules, who is holding points, and the
 * counter tool for spending them.
 *
 * Points are keyed on phone number rather than account, because most customers
 * are walk-ins who never sign in.
 */
export function OwnerLoyalty({ cafeId }: OwnerLoyaltyProps) {
    const [settings, setSettings] = useState<Settings>({
        enabled: false,
        minDailySpend: 300,
        pointsPerDay: 5,
        rupeesPerPoint: 1,
        minRedeemPoints: 50,
    });
    const [members, setMembers] = useState<Member[]>([]);
    const [recent, setRecent] = useState<RecentEntry[]>([]);
    const [outstandingPoints, setOutstandingPoints] = useState(0);
    const [outstandingRupees, setOutstandingRupees] = useState(0);
    const [memberCount, setMemberCount] = useState(0);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const [rewards, setRewards] = useState<Reward[]>([]);
    const [chosenRewardId, setChosenRewardId] = useState('');
    const [redeemPhone, setRedeemPhone] = useState('');
    const [redeemPoints, setRedeemPoints] = useState('');
    const [redeemMode, setRedeemMode] = useState<'redeemed' | 'bonus'>('redeemed');
    const [redeeming, setRedeeming] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/loyalty?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load points');

            setSettings(data.settings);
            setMembers(Array.isArray(data.members) ? data.members : []);
            setRecent(Array.isArray(data.recent) ? data.recent : []);
            setOutstandingPoints(Number(data.outstandingPoints) || 0);
            setOutstandingRupees(Number(data.outstandingRupees) || 0);
            setMemberCount(Number(data.memberCount) || 0);
            setError(null);

            // The counter needs the menu to hand anything over, so it is loaded
            // with the rest rather than only when the menu section is opened.
            const rewardsRes = await fetch(
                `/api/owner/loyalty/rewards?cafeId=${encodeURIComponent(cafeId)}`,
                { credentials: 'include' }
            );
            if (rewardsRes.ok) {
                const rewardsData = await rewardsRes.json();
                setRewards(
                    (Array.isArray(rewardsData.rewards) ? rewardsData.rewards : []).filter(
                        (reward: Reward) => reward.isActive
                    )
                );
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load points');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const saveSettings = async () => {
        if (!cafeId) return;

        setSaving(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/loyalty', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, ...settings }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setNotice('Saved.');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const submitPoints = async () => {
        if (!cafeId) return;

        setRedeeming(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/loyalty', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafeId,
                    phone: redeemPhone,
                    // A reward carries its own price; only the free-form modes
                    // send a number.
                    ...(chosenRewardId
                        ? { rewardId: chosenRewardId }
                        : { points: Number(redeemPoints), reason: redeemMode }),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not apply points');

            setNotice(
                data.reward
                    ? `Done — give them: ${data.reward}.`
                    : redeemMode === 'redeemed'
                      ? `Done — give ₹${data.rupeesOff} off this session.`
                      : `Added ${redeemPoints} points.`
            );
            setRedeemPhone('');
            setRedeemPoints('');
            setChosenRewardId('');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not apply points');
        } finally {
            setRedeeming(false);
        }
    };

    const searchKey = search.replace(/\D/g, '');
    const visibleMembers = searchKey
        ? members.filter(
              (member) =>
                  member.phone.includes(searchKey) ||
                  (member.name || '').toLowerCase().includes(search.toLowerCase())
          )
        : members;

    // The rule is easy to misread as "per visit", so it is spelled out with the
    // owner's own numbers rather than left abstract.
    const cheapestReward = rewards.length
        ? Math.min(...rewards.map((reward) => reward.pointsCost))
        : 0;
    const daysToCheapest =
        cheapestReward > 0 && settings.pointsPerDay > 0
            ? Math.ceil(cheapestReward / settings.pointsPerDay)
            : 0;

    const COLUMNS = 'minmax(140px,1.4fr) minmax(110px,1fr) 96px 110px 132px';

    return (
        <div className="flex flex-col gap-[18px]">
            <Kpis
                items={[
                    {
                        label: 'POINTS OWED',
                        value: outstandingPoints.toLocaleString('en-IN'),
                        tone: outstandingPoints > 0 ? 'orange' : 'ink',
                        sub: `worth ₹${outstandingRupees.toLocaleString('en-IN')} off future bills`,
                    },
                    { label: 'MEMBERS', value: String(memberCount), sub: 'collecting at this café' },
                    {
                        label: 'PER DAY',
                        value: `+${settings.pointsPerDay}`,
                        tone: 'lime',
                        sub: settings.minDailySpend > 0 ? `on ₹${settings.minDailySpend} or more` : 'on any spend',
                    },
                    {
                        label: 'CHEAPEST REWARD',
                        value: cheapestReward > 0 ? `${cheapestReward} pts` : '—',
                        sub: daysToCheapest > 0 ? `about ${daysToCheapest} visits to earn` : 'no rewards set up',
                    },
                ]}
            />

            {/* The rule, as one line of chips. It is easy to misread as "per
                visit", so it is spelled out with the owner's own numbers. */}
            <Panel className="flex flex-wrap items-center gap-2.5 px-4 py-3.5">
                <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">
                    RULES IN FORCE
                </span>
                {[
                    { k: 'EARNS', v: `+${settings.pointsPerDay}/DAY` },
                    { k: 'NEEDS', v: settings.minDailySpend > 0 ? `₹${settings.minDailySpend} SPEND` : 'ANY SPEND' },
                    { k: 'POINT WORTH', v: `₹${settings.rupeesPerPoint}` },
                    { k: 'MIN REDEEM', v: `${settings.minRedeemPoints} PTS` },
                    { k: 'SCHEME', v: settings.enabled ? 'ON' : 'OFF' },
                ].map((rule) => (
                    <span
                        key={rule.k}
                        className="flex items-center gap-2 whitespace-nowrap border border-[#f2f0ea]/[0.14] bg-[#17171a] px-[11px] py-2 font-mono text-[11px] text-[#f2f0ea]/75"
                    >
                        {rule.k}
                        <span style={{ color: rule.k === 'SCHEME' && !settings.enabled ? '#ff5c2b' : '#d8ff3c' }}>
                            {rule.v}
                        </span>
                    </span>
                ))}
                <span className="min-w-[10px] flex-1" />
                <GhostButton onClick={() => setShowRules((open) => !open)}>
                    {showRules ? 'CLOSE' : 'EDIT RULES →'}
                </GhostButton>
            </Panel>

            {showRules && (
                <Panel className="flex flex-col gap-4 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                            { label: 'POINTS PER DAY', key: 'pointsPerDay' as const },
                            { label: 'MIN DAILY SPEND', key: 'minDailySpend' as const },
                            { label: 'A POINT IS WORTH ₹', key: 'rupeesPerPoint' as const },
                            { label: 'MIN POINTS TO REDEEM', key: 'minRedeemPoints' as const },
                        ].map((entry) => (
                            <div key={entry.key} className="flex flex-col gap-1.5">
                                <span className="font-mono text-[9.5px] tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                                    {entry.label}
                                </span>
                                <Field
                                    type="number"
                                    value={String(settings[entry.key])}
                                    onChange={(value) =>
                                        setSettings({ ...settings, [entry.key]: Number(value) || 0 })
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Chips
                            items={[
                                { id: 'on', label: 'SCHEME ON' },
                                { id: 'off', label: 'SCHEME OFF' },
                            ]}
                            active={settings.enabled ? 'on' : 'off'}
                            onPick={(id) => setSettings({ ...settings, enabled: id === 'on' })}
                        />
                        <span className="min-w-[10px] flex-1" />
                        <PrimaryButton onClick={saveSettings} disabled={saving}>
                            {saving ? 'SAVING…' : 'SAVE RULES'}
                        </PrimaryButton>
                    </div>
                </Panel>
            )}

            {notice && (
                <div className="border border-[#d8ff3c]/[0.28] bg-[#d8ff3c]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#d8ff3c]">
                    {notice}
                </div>
            )}
            {error && (
                <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
                    {error}
                </div>
            )}

            {/* Handing points over, or putting some on by hand. */}
            <Panel className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-[9px]">
                    <Chips
                        items={[
                            { id: 'redeemed', label: 'REDEEM POINTS' },
                            { id: 'bonus', label: 'GIVE POINTS' },
                        ]}
                        active={redeemMode}
                        onPick={(id) => setRedeemMode(id as 'redeemed' | 'bonus')}
                    />
                    <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Field value={redeemPhone} onChange={setRedeemPhone} placeholder="10-DIGIT NUMBER" className="w-[170px]" />

                    {redeemMode === 'redeemed' && rewards.length > 0 && (
                        <select
                            value={chosenRewardId}
                            onChange={(e) => setChosenRewardId(e.target.value)}
                            className="h-[38px] border border-[#f2f0ea]/[0.14] bg-transparent px-3 font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea] outline-none focus:border-[#d8ff3c]"
                        >
                            <option value="" className="bg-[#111113]">PICK A REWARD</option>
                            {rewards.map((reward) => (
                                <option key={reward.id} value={reward.id} className="bg-[#111113]">
                                    {reward.name} · {reward.pointsCost} pts
                                </option>
                            ))}
                        </select>
                    )}

                    <Field value={redeemPoints} onChange={setRedeemPoints} placeholder="POINTS" type="number" className="w-[120px]" />

                    <PrimaryButton onClick={submitPoints} disabled={redeeming}>
                        {redeeming ? 'SAVING…' : redeemMode === 'redeemed' ? 'TAKE POINTS OFF' : 'ADD POINTS'}
                    </PrimaryButton>
                </div>
            </Panel>

            <div className="flex flex-wrap items-center gap-[9px]">
                <SectionBar
                    title="MEMBERS"
                    action={
                        <Field
                            value={search}
                            onChange={setSearch}
                            placeholder="FIND BY NAME OR NUMBER"
                            className="w-[220px]"
                        />
                    }
                />
            </div>

            <Panel>
                <TableHead columns={COLUMNS}>
                    <span>MEMBER</span>
                    <span>BALANCE</span>
                    <span className="text-right">WORTH</span>
                    <span className="text-right">LAST SEEN</span>
                    <span className="text-right">ACTIONS</span>
                </TableHead>

                {visibleMembers.length === 0 ? (
                    <EmptyRow>
                        {members.length === 0
                            ? 'Nobody is collecting yet. Points go on automatically as people play.'
                            : 'Nobody matches that search.'}
                    </EmptyRow>
                ) : (
                    visibleMembers.map((member) => {
                        const canRedeem = member.balance >= settings.minRedeemPoints && settings.minRedeemPoints > 0;
                        const initials = (member.name || member.phone)
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join('')
                            .toUpperCase();

                        return (
                            <TableRow
                                key={member.phone}
                                columns={COLUMNS}
                                edge={canRedeem ? '#d8ff3c' : 'transparent'}
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span
                                        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-black"
                                        style={
                                            canRedeem
                                                ? { background: '#d8ff3c', color: '#0b0b0c' }
                                                : { background: 'rgba(242,240,234,.08)', color: 'rgba(242,240,234,.6)' }
                                        }
                                    >
                                        {initials}
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-[3px]">
                                        <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                            {member.name || 'No name'}
                                        </span>
                                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                            {member.phone}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="whitespace-nowrap text-[15px] font-extrabold text-[#f2f0ea]">
                                        {member.balance.toLocaleString('en-IN')}
                                        <span className="font-mono text-[10px] font-medium text-[#f2f0ea]/35"> pts</span>
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        {member.earned} earned · {member.redeemed} spent
                                    </span>
                                </div>

                                <span
                                    className="whitespace-nowrap text-right text-[13.5px] font-extrabold"
                                    style={{ color: canRedeem ? '#d8ff3c' : 'rgba(242,240,234,.5)' }}
                                >
                                    ₹{member.worthRupees.toLocaleString('en-IN')}
                                </span>

                                <span className="whitespace-nowrap text-right font-mono text-[10.5px] text-[#f2f0ea]/40">
                                    {member.lastActivity ? formatDate(member.lastActivity).toUpperCase() : '—'}
                                </span>

                                <div className="flex justify-end gap-[5px]">
                                    <button
                                        type="button"
                                        title="Take points off this member"
                                        onClick={() => { setRedeemPhone(member.phone); setRedeemMode('redeemed'); }}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        REDEEM
                                    </button>
                                    <button
                                        type="button"
                                        title="Put points on by hand"
                                        onClick={() => { setRedeemPhone(member.phone); setRedeemMode('bonus'); }}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                                    >
                                        + PTS
                                    </button>
                                </div>
                            </TableRow>
                        );
                    })
                )}

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                    <span>{visibleMembers.length} of {members.length} members</span>
                    <span className="flex-1" />
                    <span>{loading ? 'LOADING…' : `${outstandingPoints.toLocaleString('en-IN')} POINTS OWED`}</span>
                </div>
            </Panel>

            {recent.length > 0 && (
                <>
                    <SectionBar title="RECENT POINTS ACTIVITY" />
                    <Panel>
                        {recent.slice(0, 8).map((entry) => (
                            <div
                                key={entry.id}
                                className="flex items-center gap-3 border-b border-[#f2f0ea]/[0.05] px-4 py-2.5 last:border-b-0"
                            >
                                <span className="whitespace-nowrap font-mono text-[10.5px] text-[#f2f0ea]/40">
                                    {formatDate(entry.createdAt).toUpperCase()}
                                </span>
                                <span className="truncate font-mono text-[11px] text-[#f2f0ea]/75">
                                    {entry.phone}
                                </span>
                                <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/40">
                                    {(REASON_LABELS[entry.reason] || entry.reason).toUpperCase()}
                                    {entry.note ? ` · ${entry.note}` : ''}
                                </span>
                                <span className="flex-1" />
                                <span
                                    className="whitespace-nowrap font-mono text-[11.5px] font-semibold"
                                    style={{ color: entry.points >= 0 ? '#d8ff3c' : '#ff5c2b' }}
                                >
                                    {entry.points >= 0 ? '+' : '−'}{Math.abs(entry.points)}
                                </span>
                            </div>
                        ))}
                    </Panel>
                </>
            )}

            {/* What the points actually buy. Its own component, and the only
                place a reward is created. */}
            <LoyaltyRewardsMenu cafeId={cafeId} onChanged={load} />
        </div>
    );
}
