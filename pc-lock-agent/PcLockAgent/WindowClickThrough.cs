using System.Runtime.InteropServices;

namespace PcLockAgent;

/// <summary>
/// Toggles WS_EX_TRANSPARENT so mouse clicks pass through a fullscreen form.
/// </summary>
internal static class WindowClickThrough
{
    private const int GwlExstyle = -20;
    private const int WsExTransparent = 0x00000020;
    private const int WsExNoActivate = 0x08000000;

    public static void SetEnabled(Form form, bool enabled)
    {
        if (!form.IsHandleCreated)
        {
            return;
        }

        var exStyle = NativeMethods.GetWindowLong(form.Handle, GwlExstyle);

        if (enabled)
        {
            exStyle |= WsExTransparent | WsExNoActivate;
        }
        else
        {
            exStyle &= ~WsExTransparent;
            exStyle &= ~WsExNoActivate;
        }

        NativeMethods.SetWindowLong(form.Handle, GwlExstyle, exStyle);
    }

    private static class NativeMethods
    {
        [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    }
}
