# Dev diagnostic: list per-app volume levels from the Windows audio mixer
# (Core Audio ISimpleAudioVolume per session). Finds why one app sounds
# quieter than another at "100%".
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class AudioMixer {
  [ComImport][Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int NotImpl1(); int NotImpl2();
    int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl session);
  }

  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl { int NotImpl1(); }

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    // IAudioSessionControl: 9 methods, then IAudioSessionControl2's
    // GetSessionIdentifier + GetSessionInstanceIdentifier precede GetProcessId
    int NotImpl1(); int NotImpl2(); int NotImpl3(); int NotImpl4(); int NotImpl5();
    int NotImpl6(); int NotImpl7(); int NotImpl8(); int NotImpl9();
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid eventContext);
    int GetMasterVolume(out float level);
    int SetMute(bool mute, ref Guid eventContext);
    int GetMute(out bool mute);
  }

  public static void List() {
    var enumerator = (IMMDeviceEnumerator)(object)new MMDeviceEnumeratorCom();
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(0 /*render*/, 1 /*multimedia*/, out device);
    var iidMgr = typeof(IAudioSessionManager2).GUID;
    object mgrObj;
    device.Activate(ref iidMgr, 1 /*INPROC*/, IntPtr.Zero, out mgrObj);
    var mgr = (IAudioSessionManager2)mgrObj;
    IAudioSessionEnumerator sessions;
    mgr.GetSessionEnumerator(out sessions);
    int count;
    sessions.GetCount(out count);
    for (int i = 0; i < count; i++) {
      IAudioSessionControl ctl;
      sessions.GetSession(i, out ctl);
      var ctl2 = (IAudioSessionControl2)ctl;
      uint pid; ctl2.GetProcessId(out pid);
      var vol = (ISimpleAudioVolume)ctl;
      float level; vol.GetMasterVolume(out level);
      bool mute; vol.GetMute(out mute);
      string name = "?";
      try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      Console.WriteLine(string.Format("{0,-20} pid={1,-7} volume={2,5:P0} muted={3}", name, pid, level, mute));
    }
  }
}
"@
[AudioMixer]::List()
