!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HomeKit RGB Bridge"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dev.kozar.homekit-rgb-bridge"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "dev.kozar.homekit-rgb-bridge"
!macroend
