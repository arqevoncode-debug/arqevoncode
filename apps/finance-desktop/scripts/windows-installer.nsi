Unicode True

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define PRODUCT_NAME "Arqevon Finance"
!define PRODUCT_VERSION "1.0.5"
!define PRODUCT_PUBLISHER "Arqevon Code"
!define PRODUCT_EXE "Arqevon Finance.exe"
!define PRODUCT_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArqevonFinance"
!define WEBVIEW2_CLIENT_GUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define PROJECT_DIR ".."

Name "${PRODUCT_NAME}"
OutFile "${PROJECT_DIR}/build/windows/Arqevon-Finance-${PRODUCT_VERSION}-Windows-x64-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Arqevon Finance"
InstallDirRegKey HKCU "Software\Arqevon Code\Arqevon Finance" "InstallDir"
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
BrandingText "Arqevon Code"
Icon "${PROJECT_DIR}/src-tauri/icons/icon.ico"
UninstallIcon "${PROJECT_DIR}/src-tauri/icons/icon.ico"

VIProductVersion "1.0.5.0"
VIAddVersionKey /LANG=1046 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=1046 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do ${PRODUCT_NAME}"
VIAddVersionKey /LANG=1046 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Copyright (c) 2026 ${PRODUCT_PUBLISHER}"

!define MUI_ABORTWARNING
!define MUI_ICON "${PROJECT_DIR}/src-tauri/icons/icon.ico"
!define MUI_UNICON "${PROJECT_DIR}/src-tauri/icons/icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${PRODUCT_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

Function GetWebView2Version
  StrCpy $1 ""

  ; O Runtime pode estar instalado para toda a maquina ou apenas para o usuario.
  ; Consultamos as visoes de registro de 64 e 32 bits para cobrir ambas as formas.
  SetRegView 64
  ReadRegStr $1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_CLIENT_GUID}" "pv"
  ${If} $1 == ""
    ReadRegStr $1 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_CLIENT_GUID}" "pv"
  ${EndIf}
  ${If} $1 == ""
    ReadRegStr $1 HKCU "Software\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_CLIENT_GUID}" "pv"
  ${EndIf}

  SetRegView 32
  ${If} $1 == ""
    ReadRegStr $1 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_CLIENT_GUID}" "pv"
  ${EndIf}
  ${If} $1 == ""
    ReadRegStr $1 HKCU "Software\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_CLIENT_GUID}" "pv"
  ${EndIf}

  ${If} $1 == "0.0.0.0"
    StrCpy $1 ""
  ${EndIf}

  Push $1
FunctionEnd

Section "Instalar" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  SetOverwrite on

  File "/oname=${PRODUCT_EXE}" "${PROJECT_DIR}/src-tauri/target/x86_64-pc-windows-msvc/release/myfinance.exe"

  DetailPrint "Verificando o Microsoft Edge WebView2..."
  Call GetWebView2Version
  Pop $1

  ${If} $1 == ""
    DetailPrint "WebView2 não encontrado. Instalando o componente..."
    File "/oname=MicrosoftEdgeWebview2Setup.exe" "${PROJECT_DIR}/build/windows/MicrosoftEdgeWebview2Setup.exe"
    ExecWait '"$INSTDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $0
    Delete "$INSTDIR\MicrosoftEdgeWebview2Setup.exe"

    ; Estes dois codigos sao declarados pela Microsoft/WinGet como sucesso.
    ; O primeiro significa que o Runtime ja estava instalado no computador.
    ${If} $0 == 0
      DetailPrint "Microsoft Edge WebView2 preparado com sucesso."
    ${ElseIf} $0 == -2147219416
      DetailPrint "Microsoft Edge WebView2 já estava instalado. Continuando..."
    ${ElseIf} $0 == -2147219187
      DetailPrint "Microsoft Edge WebView2 já está disponível. Continuando..."
    ${Else}
      ; Para outros retornos, ainda confirmamos o Registro antes de interromper.
      Call GetWebView2Version
      Pop $1
      ${If} $1 == ""
        MessageBox MB_ICONSTOP|MB_OK "Não foi possível instalar o Microsoft Edge WebView2 (código $0). Instale o WebView2 Runtime e execute novamente o instalador do ${PRODUCT_NAME}."
        Abort
      ${Else}
        DetailPrint "Microsoft Edge WebView2 $1 preparado com sucesso."
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "Microsoft Edge WebView2 $1 já está instalado."
  ${EndIf}

  CreateDirectory "$SMPROGRAMS\Arqevon Finance"
  CreateShortcut "$SMPROGRAMS\Arqevon Finance\Arqevon Finance.lnk" "$INSTDIR\${PRODUCT_EXE}"
  CreateShortcut "$DESKTOP\Arqevon Finance.lnk" "$INSTDIR\${PRODUCT_EXE}"

  WriteUninstaller "$INSTDIR\Desinstalar Arqevon Finance.exe"
  WriteRegStr HKCU "Software\Arqevon Code\Arqevon Finance" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Desinstalar Arqevon Finance.exe"'
  WriteRegDWORD HKCU "${PRODUCT_UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${PRODUCT_UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Arqevon Finance.lnk"
  Delete "$SMPROGRAMS\Arqevon Finance\Arqevon Finance.lnk"
  RMDir "$SMPROGRAMS\Arqevon Finance"
  Delete "$INSTDIR\${PRODUCT_EXE}"
  Delete "$INSTDIR\Desinstalar Arqevon Finance.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${PRODUCT_UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Arqevon Code\Arqevon Finance"
SectionEnd
