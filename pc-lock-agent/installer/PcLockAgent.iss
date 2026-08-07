; Inno Setup script for the BookMyGame PC Lock installer.
;
; Do not compile this by hand - run tools\build-installer.ps1, which publishes
; the agent first.
;
; This installer contains no credentials. The agent asks for a setup code the
; first time it runs and fetches its own settings, which is what lets one build
; serve every cafe and be hosted as a public download.

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

; No Architectures* directives on purpose. The agent itself is 64-bit, but the
; installer only copies files into {sd}\BookMyGame — it never touches Program
; Files or the 64-bit registry view, so it has no reason to care. Setting them
; only risks a version-specific quirk in whichever Inno Setup happens to be
; installed, for no benefit here.

[Files]
Source: "..\publish\{#AppExeName}";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\publish\appsettings.json";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\install-startup.ps1";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\uninstall-startup.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Ticked by default: the agent needs running once to ask for the setup code, and
; until that happens it locks nothing. Starting it here means the person doing
; the install can finish the job while they are still at the machine.
Filename: "{app}\{#AppExeName}"; \
  Description: "Enter the setup code now"; \
  Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\uninstall-startup.ps1"""; \
  Flags: runhidden; RunOnceId: "RemoveStartupTask"

[Code]
var
  AccountPage: TInputQueryWizardPage;
  CreateAccountCheck: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  AccountPage := CreateInputQueryPage(wpSelectDir,
    'Customer account',
    'Which Windows account will customers use?',
    'The lock runs only for this account, so your own account keeps a normal' + #13#10 +
    'Windows and you can always sign in to manage this PC.' + #13#10 + #13#10 +
    'You do not need to choose a station name here - that comes from the setup' + #13#10 +
    'code you will enter after installing.');

  AccountPage.Add('Customer Windows account:', False);
  AccountPage.Values[0] := 'GamingUser';

  CreateAccountCheck := CreateInputOptionPage(AccountPage.ID,
    'Customer account',
    'Create the Windows account if it does not exist?',
    'Leave this ticked unless you have already made the account yourself.' + #13#10 +
    'It is created as a standard (non-administrator) account, which is what' + #13#10 +
    'stops customers installing software or getting past the lock.',
    False, False);

  CreateAccountCheck.Add('Create the account if missing');
  CreateAccountCheck.Values[0] := True;
end;

function GamingUser: String;
begin
  Result := Trim(AccountPage.Values[0]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if (CurPageID = AccountPage.ID) and (GamingUser = '') then
  begin
    MsgBox('Please enter the Windows account customers will use.', mbError, MB_OK);
    Result := False;
  end;
end;

{ Runs a command and waits, returning False if it could not be started. }
function RunHidden(const FileName, Params: String; var ResultCode: Integer): Boolean;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
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
    InstallStartupTask;
  end;
end;
