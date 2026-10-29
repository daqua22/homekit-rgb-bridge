' HomeKit RGB Bridge: portable interactive launcher (no administrator privileges)
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
profile = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\HomeKitRGBBridge"
openArg = " --open"
If WScript.Arguments.Count >= 2 Then
  If WScript.Arguments.Item(0) <> "--profile" Then WScript.Quit 2
  profile = WScript.Arguments.Item(1)
  If WScript.Arguments.Count >= 3 Then
    If WScript.Arguments.Item(2) = "--no-open" Then openArg = ""
  End If
Else
profile = InputBox("Choose your private data folder. For upgrades, keep the EXACT existing folder to preserve Apple Home pairing. A hardware setup may use HomeKitRGBBridge-Hardware. New users can accept the default.", "HomeKit RGB Bridge - profile", profile)
End If
If Len(profile) = 0 Then WScript.Quit
If InStr(profile, Chr(34)) > 0 Or InStr(profile, vbCr) > 0 Or InStr(profile, vbLf) > 0 Then
  MsgBox "The data-folder path contains unsupported characters.", vbExclamation, "HomeKit RGB Bridge"
  WScript.Quit
End If
node = root & "\runtime\node.exe"
If Not fso.FileExists(node) Then
  MsgBox "Bundled runtime is missing. Extract the complete Windows portable package first.", vbExclamation, "HomeKit RGB Bridge"
  WScript.Quit
End If
exitCode = shell.Run(Chr(34) & node & Chr(34) & " " & Chr(34) & root & "\dist\index.js" & Chr(34) & " app" & openArg & " --data-dir " & Chr(34) & profile & Chr(34), 0, True)

If exitCode <> 0 Then MsgBox "The bridge could not start. Check whether an older bridge is running, the selected data folder is correct, and Windows Script Host is permitted. See docs\troubleshooting.md.", vbExclamation, "HomeKit RGB Bridge"
