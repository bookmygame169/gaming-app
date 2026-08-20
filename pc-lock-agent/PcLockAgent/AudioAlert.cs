using System.Media;

namespace PcLockAgent;

/// <summary>
/// The time warning, as a sound.
/// </summary>
/// <remarks>
/// Exists because a customer in a fullscreen game cannot be shown anything. A
/// window over an exclusive-fullscreen title minimises it, and the alternative
/// — injecting into the game to draw inside it — would risk the customer's
/// account with an anti-cheat. A sound reaches them through the game with
/// nothing drawn and nothing to minimise.
/// <para>
/// Generated rather than shipped as a file: no asset to lose in a single-file
/// publish, no path to get wrong on a café PC, and the pattern can say
/// something the volume knob cannot. Two rising notes mean time is getting on;
/// the faster triple means this is the last minute.
/// </para>
/// </remarks>
internal static class AudioAlert
{
    private const int SampleRate = 44100;

    /// <summary>Loud enough to carry over a game, short of anything that clips.</summary>
    private const double Amplitude = 0.34;

    /// <summary>The last minute gets its own, more insistent pattern.</summary>
    private const int UrgentBelowSeconds = 61;

    public static void PlayTimeWarning(int secondsRemaining)
    {
        var urgent = secondsRemaining <= UrgentBelowSeconds;

        var pattern = urgent
            ? new[] { (988, 130), (0, 70), (988, 130), (0, 70), (1319, 320) }
            : new[] { (659, 200), (0, 80), (880, 340) };

        Play(pattern);
    }

    private static void Play((int Hz, int Ms)[] pattern)
    {
        // Off the UI thread. PlaySync blocks for the length of the sound, and
        // the lock screen behind this has to keep painting.
        _ = Task.Run(() =>
        {
            try
            {
                var wav = BuildWav(pattern);

                using var stream = new MemoryStream(wav);
                using var player = new SoundPlayer(stream);

                // Sync, inside a background task, so the stream outlives the
                // playback. Play() returns immediately and would let both be
                // disposed out from under the sound.
                player.PlaySync();
            }
            catch (Exception ex)
            {
                // A café PC with no sound card, or a muted one. The warning is
                // a courtesy; never let it take anything else down.
                AgentLog.Warn($"Could not play the time warning: {ex.Message}");
            }
        });
    }

    private static byte[] BuildWav((int Hz, int Ms)[] pattern)
    {
        var samples = new List<short>();

        foreach (var (hz, ms) in pattern)
        {
            var count = SampleRate * ms / 1000;

            for (var i = 0; i < count; i++)
            {
                if (hz == 0)
                {
                    samples.Add(0);
                    continue;
                }

                var value = Math.Sin(2 * Math.PI * hz * i / SampleRate);

                // Faded at both ends. A tone that starts and stops at full
                // amplitude clicks, and a click is what a broken speaker sounds
                // like rather than a notification.
                var fade = Math.Min(1.0, Math.Min(i, count - i) / (SampleRate * 0.012));

                samples.Add((short)(value * fade * Amplitude * short.MaxValue));
            }
        }

        var dataBytes = samples.Count * 2;

        using var buffer = new MemoryStream();
        using var writer = new BinaryWriter(buffer);

        writer.Write("RIFF"u8.ToArray());
        writer.Write(36 + dataBytes);
        writer.Write("WAVE"u8.ToArray());

        writer.Write("fmt "u8.ToArray());
        writer.Write(16);                       // PCM header length
        writer.Write((short)1);                 // PCM, uncompressed
        writer.Write((short)1);                 // mono
        writer.Write(SampleRate);
        writer.Write(SampleRate * 2);           // bytes per second
        writer.Write((short)2);                 // block align
        writer.Write((short)16);                // bits per sample

        writer.Write("data"u8.ToArray());
        writer.Write(dataBytes);

        foreach (var sample in samples)
        {
            writer.Write(sample);
        }

        writer.Flush();
        return buffer.ToArray();
    }
}
