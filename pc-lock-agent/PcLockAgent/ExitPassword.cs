using System.Security.Cryptography;
using System.Text;

namespace PcLockAgent;

/// <summary>
/// The password that lets an administrator close the agent.
/// </summary>
/// <remarks>
/// Ctrl+Alt+Shift+Q asks for this. Without it the only way off a locked station
/// is Ctrl+Alt+Del and a sign-out, which is fine but slow when somebody is
/// standing at the machine trying to fix something.
/// <para>
/// Stored as a PBKDF2 hash with a per-machine salt, never as the password
/// itself. Two reasons, both of which apply here: this repository is public, and
/// the file the hash is read from sits on a PC a customer is signed into. A
/// customer who reads it learns nothing they can type.
/// </para>
/// <para>
/// Format is <c>iterations.salt.hash</c>, salt and hash base64. Keeping the
/// iteration count in the string means it can be raised later without stranding
/// the passwords already set.
/// </para>
/// </remarks>
internal static class ExitPassword
{
    /// <summary>
    /// Cost of one attempt.
    /// </summary>
    /// <remarks>
    /// High enough that guessing at a keyboard is hopeless, low enough that a
    /// correct password does not leave an administrator waiting.
    /// </remarks>
    private const int Iterations = 210_000;

    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    /// <summary>Builds the stored form of a password.</summary>
    public static string Create(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Derive(password, salt, Iterations);

        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    /// <summary>Whether this password matches what was stored.</summary>
    public static bool Verify(string password, string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored) || string.IsNullOrEmpty(password))
        {
            return false;
        }

        try
        {
            var parts = stored.Split('.');
            if (parts.Length != 3
                || !int.TryParse(parts[0], out var iterations)
                || iterations <= 0)
            {
                AgentLog.Warn("The stored exit password is not in a format this build understands.");
                return false;
            }

            var salt = Convert.FromBase64String(parts[1]);
            var expected = Convert.FromBase64String(parts[2]);
            var actual = Derive(password, salt, iterations);

            // Fixed-time, so a wrong password cannot be narrowed down by how
            // long the comparison took.
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not check the exit password: {ex.Message}");
            return false;
        }
    }

    private static byte[] Derive(string password, byte[] salt, int iterations) =>
        Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, iterations, HashAlgorithmName.SHA256, HashBytes);
}
