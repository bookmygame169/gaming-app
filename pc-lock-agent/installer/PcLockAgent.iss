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
; installer only copies files into {sd}\BookMyGame - it never touches Program
; Files or the 64-bit registry view, so it has no reason to care. Setting them
; only risks a version-specific quirk in whichever Inno Setup happens to be
; installed, for no benefit here.

[Files]
Source: "..\publish\{#AppExeName}";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\publish\appsettings.json";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\install-startup.ps1";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\uninstall-startup.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\check-setup.ps1";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\tools\update-agent.ps1";     DestDir: "{app}"; Flags: ignoreversion

[Run]
; Ticked by default: the agent needs running once to ask for the setup code, and
; until that happens it locks nothing. Starting it here means the person doing
; the install can finish the job while they are still at the machine.
Filename: "{app}\{#AppExeName}"; \
  Description: "Enter the setup code now"; \
  Flags: postinstall nowait skipifsilent

[UninstallRun]
; {sysnative} for the same reason as the install step: the uninstaller is a
; 32-bit process, and the 32-bit PowerShell is missing modules this needs.
Filename: "{sysnative}\WindowsPowerShell\v1.0\powershell.exe"; \
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

{ Runs a command line through cmd, with the quoting cmd actually requires.

  cmd /? spells out the rule, and it is a trap: quotes on the command line are
  preserved only when there are EXACTLY TWO of them. With more than two, cmd
  strips the leading quote and the last quote and runs whatever is left.

  This command has ten. Stripping the first and last turned the program name
  into

    C:\...\powershell.exe -ExecutionPolicy Bypass -NoProfile -File

  - everything up to the next quote, taken as one filename - which does not
  exist, so cmd exited 1 without ever starting PowerShell. install-startup.ps1
  had never run on any machine; the "startup setup reported a problem" dialog
  was cmd failing to find a program, and several rounds of fixes went into a
  script that was never being executed.

  The documented workaround is one extra pair of quotes around the whole thing.
  cmd removes exactly that pair and the real command survives.

  The net user calls above never hit this, because their command line starts
  with a letter rather than a quote - which is precisely why creating the
  account worked while registering the task never did. }
function RunViaCmd(const CommandLine: String; var ResultCode: Integer): Boolean;
begin
  Result := RunHidden(ExpandConstant('{cmd}'), '/C "' + CommandLine + '"', ResultCode);
end;

{ Everything the post-install steps do is written here. Without it a failure
  surfaces as a bare exit code with no way to tell what went wrong, since these
  run hidden. }
function SetupLogPath: String;
begin
  Result := ExpandConstant('{app}\install-log.txt');
end;

{ The last few lines of the install log, for putting in the failure message.

  Pointing at a file was not enough. Three releases were spent guessing at a
  cause because the only thing anyone ever saw - and the only thing that ever
  reached me - was "code 1" and the path to a file nobody opened. The error
  belongs on the screen the person is already looking at. }
function TailOfSetupLog(HowMany: Integer): String;
var
  Lines: TArrayOfString;
  Total, First, I: Integer;
begin
  Result := '';

  if not LoadStringsFromFile(SetupLogPath, Lines) then
    Exit;

  Total := GetArrayLength(Lines);
  First := Total - HowMany;
  if First < 0 then
    First := 0;

  for I := First to Total - 1 do
    if Trim(Lines[I]) <> '' then
      Result := Result + Lines[I] + #13#10;
end;

procedure EnsureGamingAccount;
var
  ResultCode: Integer;
begin
  if not CreateAccountCheck.Values[0] then
    Exit;

  { net user fails harmlessly if the account already exists, so this is safe to
    run either way. Output is appended rather than checked, because "already
    exists" is a failure code we deliberately ignore. }
  RunViaCmd('net user "' + GamingUser + '" /add >> "' + SetupLogPath + '" 2>&1', ResultCode);

  RunViaCmd('net localgroup Users "' + GamingUser + '" /add >> "' + SetupLogPath + '" 2>&1', ResultCode);
end;

procedure InstallStartupTask;
var
  ResultCode: Integer;
begin
  { Routed through cmd so the script's own output lands in the log. Running
    powershell.exe directly would discard it, which is what made an earlier
    failure impossible to diagnose. }
  // Written with // rather than { }: Pascal brace comments do not nest, so the
  // closing brace of a constant like {sysnative} ends the comment early and the
  // prose after it is compiled as code. That is what broke this build once.
  //
  // {sysnative} rather than plain powershell.exe: this installer is a 32-bit
  // process, so an unqualified name resolves to the 32-bit PowerShell, which is
  // missing modules the script needs. On 32-bit Windows {sysnative} is simply
  // {sys}, so this is safe either way.
  if not RunViaCmd(
    '"' + ExpandConstant('{sysnative}\WindowsPowerShell\v1.0\powershell.exe') +
    '" -ExecutionPolicy Bypass -NoProfile -File "' +
    ExpandConstant('{app}\install-startup.ps1') +
    '" -ExePath "' + ExpandConstant('{app}\{#AppExeName}') +
    '" -GamingUser "' + GamingUser + '" >> "' + SetupLogPath + '" 2>&1', ResultCode) then
  begin
    MsgBox('Could not run the startup setup. The lock is installed but will not' + #13#10 +
           'start on its own. Run install-startup.ps1 from the install folder as' + #13#10 +
           'an administrator to finish.', mbError, MB_OK);
    Exit;
  end;

  if ResultCode <> 0 then
    MsgBox('The startup setup reported a problem (code ' + IntToStr(ResultCode) + ').' + #13#10 +
           'The lock may not start on its own until that is fixed.' + #13#10 + #13#10 +
           'What went wrong:' + #13#10 + #13#10 +
           TailOfSetupLog(14) + #13#10 +
           'Full log: ' + SetupLogPath, mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    EnsureGamingAccount;
    InstallStartupTask;
  end;
end;
