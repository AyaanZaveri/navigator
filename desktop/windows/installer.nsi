Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "Navigator"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Navigator"
InstallDirRegKey HKCU "Software\Navigator Desktop" "InstallDir"
RequestExecutionLevel user
; Private builds favor quick packaging/extraction over a smaller download.
SetCompressor /SOLID zlib
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "Navigator"
VIAddVersionKey "FileDescription" "Navigator private Windows installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "See bundled THIRD-PARTY.md and licenses"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "This private build requires 64-bit Windows 11 on an Intel or AMD PC."
    Abort
  ${EndIf}
  SetShellVarContext current
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $0 < 22000
    MessageBox MB_OK|MB_ICONSTOP "This private build requires Windows 11."
    Abort
  ${EndIf}
  retry:
  FindWindow $0 "NavigatorDesktop"
  ${If} $0 == 0
    FindWindow $0 "NavigatorDesktopSmoke"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close Navigator before installing or upgrading it." IDRETRY retry
    Abort
  ${EndIf}
FunctionEnd

; Microsoft documents this runtime GUID in the 32-bit EdgeUpdate registry view.
Function DetectWebView2
  SetRegView 32
  ReadRegStr $0 HKLM "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "Navigator"
  Call DetectWebView2
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=WebView2Setup.exe "${BOOTSTRAPPER}"
    DetailPrint "Installing Microsoft Edge WebView2 Runtime…"
    ExecWait '"$PLUGINSDIR\WebView2Setup.exe" /silent /install' $1
    Call DetectWebView2
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
      MessageBox MB_OK|MB_ICONSTOP "WebView2 could not be installed (exit code $1). Install Microsoft Edge WebView2 Evergreen Runtime, then run this installer again."
      Abort
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
  ; Remove an older server before copying, so renamed hashed chunks and removed
  ; dependencies cannot survive manual upgrades. Profile data lives elsewhere.
  RMDir /r "$INSTDIR\resources"
  File /r "${PACKAGE_DIR}\*"
  DetailPrint "Verifying startup files and preparing Navigator's local services…"
  ; Installation-only preparation loads the bundled service and video engine.
  ; The ordinary shortcut never runs this step. No antivirus settings change.
  ExecWait '"$INSTDIR\navigator-desktop.exe" --prepare-install' $1
  ${If} $1 != 0
    SetErrorLevel 1
    IfSilent preparation_failed
    MessageBox MB_OK|MB_ICONSTOP "Navigator could not finish preparing its files. See %LOCALAPPDATA%\Navigator Desktop\installation.log, then run this installer again."
    preparation_failed:
    Abort
  ${EndIf}
  DetailPrint "Navigator is ready."
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\Navigator.lnk" "$INSTDIR\navigator-desktop.exe" "" "$INSTDIR\Navigator.ico"
  WriteRegStr HKCU "Software\Navigator Desktop" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "DisplayName" "Navigator"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "DisplayIcon" "$INSTDIR\Navigator.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop" "NoRepair" 1
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  retry:
  FindWindow $0 "NavigatorDesktop"
  ${If} $0 == 0
    FindWindow $0 "NavigatorDesktopSmoke"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close Navigator before uninstalling it." IDRETRY retry
    Abort
  ${EndIf}
FunctionEnd

Section "Uninstall"
  ; Windows cannot remove the process's current working directory. Move out
  ; before deleting the installation tree; profile data is stored elsewhere.
  SetOutPath "$TEMP"
  Delete "$SMPROGRAMS\Navigator.lnk"
  Delete "$INSTDIR\navigator-desktop.exe"
  Delete "$INSTDIR\Navigator.ico"
  Delete "$INSTDIR\WINDOWS-README.txt"
  RMDir /r "$INSTDIR\resources"
  ; The launch stub starts this temporary uninstaller before its own process
  ; finishes exiting. Delete it last, with bounded retries for that image lock.
  StrCpy $R0 50
  uninstall_self_retry:
    ClearErrors
    Delete "$INSTDIR\Uninstall.exe"
    IfErrors 0 uninstall_self_done
    IntOp $R0 $R0 - 1
    IntCmp $R0 0 uninstall_self_done uninstall_self_done
    Sleep 100
    Goto uninstall_self_retry
  uninstall_self_done:
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Navigator Desktop"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorDesktop"
  ; Deliberately retain the user's profile, sign-in and settings.
SectionEnd
