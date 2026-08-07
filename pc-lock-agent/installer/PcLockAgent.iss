; Inno Setup script for the BookMyGame PC Lock installer.
;
; Do not compile this by hand - run tools\build-installer.ps1, which publishes
; the agent and generates the settings this script bundles.
;
; The installer asks for one thing: which station this PC is. Everything else
; (broker address, credentials, cafe id) is baked in at build time, because it
; is identical on every machine and asking five times invites a typo.

#define AppName "BookMyGame PC Lock"
#define AppPublisher "BookMyGame"
#define AppExeName "PcLockAgent.exe"

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={sd}\BookMyGame\PcLockAgent
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputBaseFilename=BookMyGame-PC-Lock-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

; Creating a Windows account and a scheduled task both need admin.
PrivilegesRequired=admin

; The agent is 64-bit self-contained.
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Files]
Source: "..\publish\{#AppExeName}";              DestDir: "{app}"; Flags: ignoreversion
Source: "..\publish\appsettings.json";           DestDir: "{app}"; Flags: ignoreversion
Source: "generated\appsettings.Local.template";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\install-startup.ps1";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\uninstall-startup.ps1";        DestDir: "{app}"; Flags: ignoreversion

[Run]
; Shown as a tick box on the final page rather than run automatically, so the
; installer never starts a fullscreen lock on the machine of whoever is setting
; it up without warning.
Filename: "{app}\{#AppExeName}"; Description: "Start the lock now"; Flags: postinstall nowait skipifsilent unchecked

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\uninstall-startup.ps1"""; \
  Flags: runhidden; RunOnceId: "RemoveStartupTask"

[Code]
var
  SettingsPage: TInputQueryWizardPage;
  CreateAccountCheck: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  SettingsPage := CreateInputQueryPage(wpSelectDir,
    'This machine',
    'Which station is this PC?',
    'Each PC needs its own station name, matching the ones on your BookMyGame' + #13#10 +
    'dashboard. Use lower case: pc-01, pc-02, and so on.' + #13#10 + #13#10 +
    'The Windows account is the one customers will use. It is kept separate from' + #13#10 +
    'your own account, so you can always sign in normally to manage the PC.');

  SettingsPage.Add('Station name (e.g. pc-01):', False);
  SettingsPage.Add('Customer Windows account:', False);

  SettingsPage.Values[0] := 'pc-01';
  SettingsPage.Values[1] := 'GamingUser';

  CreateAccountCheck := CreateInputOptionPage(SettingsPage.ID,
    'Customer account',
    'Create the Windows account if it does not exist?',
    'Leave this ticked unless you have already made the account yourself.' + #13#10 +
    'It is created as a standard (non-administrator) account, which is what' + #13#10 +
    'stops customers installing software or getting past the lock.',
    False, False);

  CreateAccountCheck.Add('Create the account if missing');
  CreateAccountCheck.Values[0] := True;
end;

function StationId: String;
begin
  Result := Lowercase(Trim(SettingsPage.Values[0]));
end;

function GamingUser: String;
begin
  Result := Trim(SettingsPage.Values[1]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = SettingsPage.ID then
  begin
    if StationId = '' then
    begin
      MsgBox('Please enter a station name, such as pc-01.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if GamingUser = '' then
    begin
      MsgBox('Please enter the Windows account customers will use.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

{ Runs a command and waits, returning False if it could not be started. }
function RunHidden(const FileName, Params: String; var ResultCode: Integer): Boolean;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure WriteStationConfig;
var
  Template: AnsiString;
  Contents: String;
begin
  { The template carries the broker settings, with the station name left as a
    placeholder because it is the one value that differs per machine. }
  if not LoadStringFromFile(ExpandConstant('{app}\appsettings.Local.template'), Template) then
  begin
    MsgBox('Could not read the bundled settings template. The install is incomplete.',
      mbError, MB_OK);
    Exit;
  end;

  Contents := String(Template);
  StringChangeEx(Contents, '__STATION_ID__', StationId, True);

  if not SaveStringToFile(ExpandConstant('{app}\appsettings.Local.json'), Contents, False) then
    MsgBox('Could not write the settings file. The install is incomplete.', mbError, MB_OK);
end;

procedure EnsureGamingAccount;
var
  ResultCode: Integer;
begin
  if not CreateAccountCheck.Values[0] then
    Exit;

  { net user fails harmlessly if the account already exists, so this is safe to
    run either way. }
  RunHidden(ExpandConstant('{cmd}'),
    '/C net user "' + GamingUser + '" /add', ResultCode);

  RunHidden(ExpandConstant('{cmd}'),
    '/C net localgroup Users "' + GamingUser + '" /add', ResultCode);
end;

procedure InstallStartupTask;
var
  ResultCode: Integer;
begin
  if not RunHidden('powershell.exe',
    '-ExecutionPolicy Bypass -NoProfile -File "' + ExpandConstant('{app}\install-startup.ps1') +
    '" -ExePath "' + ExpandConstant('{app}\{#AppExeName}') +
    '" -GamingUser "' + GamingUser + '"', ResultCode) then
  begin
    MsgBox('Could not run the startup setup. The lock is installed but will not' + #13#10 +
           'start on its own. Run install-startup.ps1 from the install folder as' + #13#10 +
           'an administrator to finish.', mbError, MB_OK);
    Exit;
  end;

  if ResultCode <> 0 then
    MsgBox('The startup setup reported a problem (code ' + IntToStr(ResultCode) + ').' + #13#10 +
           'The lock will not start on its own until that is fixed.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    EnsureGamingAccount;
    WriteStationConfig;
    InstallStartupTask;
  end;
end;
