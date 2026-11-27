; Instalador de SIDI para Windows (NSIS 3, Modern UI 2).
;
; Lo genera `npm run dist` (scripts/empaquetar.js): ese script arma la app en
; build/win-unpacked y luego llama a makensis con /DVERSION=<versión> /DSRC=<carpeta>.
;
; Debe conservar los mismos valores que el instalador 1.0.0 para que una versión
; nueva se instale ENCIMA de la anterior (misma carpeta y misma entrada en
; "Agregar o quitar programas"):
;   - Instalación por usuario, sin permisos de administrador.
;   - Carpeta: %LOCALAPPDATA%\Programs\SIDI
;   - Clave de desinstalación: HKCU\...\Uninstall\mx.prepaveracruz.sidi
; Los datos (app.db y CV) viven en %APPDATA%\SIDI\data (electron/main.js), así que
; instalar o desinstalar NO los toca.

Unicode true
SetCompressor /SOLID lzma

!ifndef VERSION
  !error "Falta /DVERSION=x.y.z"
!endif
!ifndef SRC
  !error "Falta /DSRC=<carpeta win-unpacked>"
!endif
!ifndef OUTFILE
  !define OUTFILE "SIDI-Setup-${VERSION}.exe"
!endif

!define APP_NOMBRE "SIDI"
!define APP_TITULO "SIDI · Sistema Integral de Información Docente"
!define APP_EXE "SIDI.exe"
!define DESINSTALADOR "Desinstalar SIDI.exe"
!define EDITOR "Calixto Isaac Galeana"
!define CLAVE_DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\mx.prepaveracruz.sidi"

Name "${APP_TITULO}"
Caption "Instalador de ${APP_NOMBRE} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NOMBRE}"
InstallDirRegKey HKCU "Software\${APP_NOMBRE}" "InstallDir"
RequestExecutionLevel user
BrandingText "${APP_TITULO} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NOMBRE}"
VIAddVersionKey "FileDescription" "Instalador de ${APP_NOMBRE}"
VIAddVersionKey "CompanyName" "${EDITOR}"
VIAddVersionKey "LegalCopyright" "Coordinación de Docentes · Preparatoria Veracruz"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "${SRC}\resources\app\build\icon.ico"
!define MUI_UNICON "${SRC}\resources\app\build\icon.ico"
!define MUI_ABORTWARNING

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir SIDI ahora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

; Si SIDI está abierto, se cierra antes de reemplazar sus archivos.
!macro CERRAR_SIDI
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq ${APP_EXE}" /NH | find /I "${APP_EXE}"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "SIDI está abierto. Presiona Aceptar para cerrarlo y continuar." IDOK +2
    Abort
    nsExec::Exec 'taskkill /IM ${APP_EXE}'
    Pop $0
    Sleep 1500
  ${EndIf}
!macroend

Section "SIDI" SecPrincipal
  SectionIn RO
  !insertmacro CERRAR_SIDI

  ; Se borra la versión anterior del programa (nunca los datos, que están en %APPDATA%).
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"

  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"

  WriteUninstaller "$INSTDIR\${DESINSTALADOR}"

  CreateShortcut "$SMPROGRAMS\${APP_NOMBRE}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$DESKTOP\${APP_NOMBRE}.lnk" "$INSTDIR\${APP_EXE}"

  WriteRegStr HKCU "Software\${APP_NOMBRE}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayName" "${APP_TITULO}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "Publisher" "${EDITOR}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "UninstallString" '"$INSTDIR\${DESINSTALADOR}"'
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  !insertmacro CERRAR_SIDI

  Delete "$SMPROGRAMS\${APP_NOMBRE}.lnk"
  Delete "$DESKTOP\${APP_NOMBRE}.lnk"
  ; Solo lo que instaló SIDI (por si se eligió una carpeta compartida).
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\${DESINSTALADOR}"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${CLAVE_DESINSTALAR}"
  DeleteRegKey HKCU "Software\${APP_NOMBRE}"
  ; %APPDATA%\SIDI\data (base de datos y CV) se conserva a propósito.
SectionEnd
