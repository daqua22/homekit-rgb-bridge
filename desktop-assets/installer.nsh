!macro customUnInstall
  ${IfNot} ${isUpdated}
    ClearErrors
    ExecWait '"$INSTDIR\HomeKit RGB Bridge.exe" --remove-managed-startup' $0
    ${If} ${Errors}
      StrCpy $0 1
    ${EndIf}
    ${If} $0 != 0
      MessageBox MB_ICONSTOP|MB_OK "OpenRGB startup could not be removed. Open the bridge Settings and disable automatic startup, then uninstall again."
      Abort
    ${EndIf}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HomeKit RGB Bridge"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dev.kozar.homekit-rgb-bridge"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "dev.kozar.homekit-rgb-bridge"
  ${EndIf}
!macroend
