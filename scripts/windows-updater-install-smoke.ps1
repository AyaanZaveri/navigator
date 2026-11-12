# Exercise the real NSIS staging/rollback code with a tiny executable fixture.
# Only product identity/registry/shortcut names are changed in the test copy.
param([string]$Output='dist/windows-updater-install-smoke.json')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Split-Path $PSScriptRoot -Parent
$work=Join-Path $env:TEMP ('navigator-installer-fixture-'+[Guid]::NewGuid().ToString('N'))
$package=Join-Path $work 'package'
$install=Join-Path $work 'installed Navigator'
$results=@()
$key='HKCU:\Software\Navigator Updater Fixture'
$uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NavigatorUpdaterFixture'
$shortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'Navigator Updater Fixture.lnk'
if((Test-Path $key) -or (Test-Path $uninstallKey) -or (Test-Path $shortcut)){throw 'Fixture identity already exists; refusing to alter it'}
New-Item -ItemType Directory -Force $package | Out-Null
try {
 $source=@'
using System;
using System.IO;
class InstallerFixture {
 static int Main(string[] args) {
  string dir=AppDomain.CurrentDomain.BaseDirectory;
  if(Array.IndexOf(args,"--prepare-install")>=0) return File.Exists(Path.Combine(dir,"prepare.fail"))?23:0;
  File.WriteAllText(Path.Combine(dir,"restarted.txt"),"restarted");return 0;
 }
}
'@
 Add-Type -TypeDefinition $source -OutputAssembly (Join-Path $package 'navigator-desktop.exe') -OutputType ConsoleApplication
 New-Item -ItemType Directory -Force (Join-Path $package 'resources') | Out-Null
 Set-Content (Join-Path $package 'resources\new.txt') 'new resources'
 Copy-Item (Join-Path $root 'assets\icons\windows\Navigator.ico') (Join-Path $package 'Navigator.ico')
 $nsi=Get-Content -Raw (Join-Path $root 'desktop\windows\installer.nsi')
 $nsi=$nsi.Replace('Software\Navigator Desktop','Software\Navigator Updater Fixture').Replace('Uninstall\NavigatorDesktop','Uninstall\NavigatorUpdaterFixture').Replace('$SMPROGRAMS\Navigator.lnk','$SMPROGRAMS\Navigator Updater Fixture.lnk').Replace('"NavigatorDesktop"','"NavigatorUpdaterFixture"').Replace('"NavigatorDesktopSmoke"','"NavigatorUpdaterFixtureSmoke"').Replace('Local\NavigatorDesktopInstaller','Local\NavigatorUpdaterFixtureInstaller')
 $nsiPath=Join-Path $work 'installer.nsi';Set-Content -LiteralPath $nsiPath -Value $nsi -Encoding UTF8
 $compiler=if($env:NAVIGATOR_MAKENSIS){$env:NAVIGATOR_MAKENSIS}else{'C:\Program Files (x86)\NSIS\makensis.exe'}
 function Compile-Fixture($destination) {
  & $compiler '/V2' '/DAPP_VERSION=0.0.1' "/DPACKAGE_DIR=$package" "/DOUTPUT_FILE=$destination" "/DBOOTSTRAPPER=$package\navigator-desktop.exe" "/DAPP_ICON=$package\Navigator.ico" $nsiPath
  if($LASTEXITCODE -ne 0){throw 'Fixture installer compilation failed'}
 }
 function Run-Fixture($exe,$expected,[switch]$Update) {
  $installArguments=@('/S');if($Update){$installArguments+='/UPDATE'};$installArguments+="/D=$install"
  $child=Start-Process -FilePath $exe -ArgumentList $installArguments -PassThru
  if(!$child.WaitForExit(60000)){$child.Kill();throw 'Installer fixture timed out'}
  if($child.ExitCode -ne $expected){throw "Expected exit $expected, got $($child.ExitCode)"}
 }
 $good=Join-Path $work 'good-setup.exe';Compile-Fixture $good
 New-Item -ItemType Directory -Force $install | Out-Null
 Set-Content (Join-Path $install 'valuable.txt') 'unrelated user files'
 Run-Fixture $good 5
 if((Get-Content (Join-Path $install 'valuable.txt')) -ne 'unrelated user files'){throw 'Unrelated directory contents were altered'}
 $results+=@{case='unrelated populated directory refused';passed=$true}
 Remove-Item -Recurse -Force $install

 New-Item -ItemType Directory -Force (Join-Path $install 'resources') | Out-Null
 Set-Content (Join-Path $install 'resources\obsolete.js') 'old chunk'
 Copy-Item (Join-Path $package 'navigator-desktop.exe') (Join-Path $install 'navigator-desktop.exe')
 Set-Content (Join-Path $install 'Uninstall.exe') 'old owned installation marker'
 Run-Fixture $good 0
 if(!(Test-Path "$install\resources\new.txt") -or (Test-Path "$install\resources\obsolete.js") -or (Test-Path "$install.update-backup")){throw 'Upgrade did not replace the complete installation cleanly'}
 $results+=@{case='verified stage replaces old resources';passed=$true}
 $original=(Get-FileHash "$install\navigator-desktop.exe" -Algorithm SHA256).Hash
 Set-Content (Join-Path $package 'prepare.fail') 'fail preparation'
 $bad=Join-Path $work 'bad-setup.exe';Compile-Fixture $bad
 Run-Fixture $bad 1
 if((Get-FileHash "$install\navigator-desktop.exe" -Algorithm SHA256).Hash -ne $original -or (Test-Path "$install\prepare.fail") -or (Test-Path "$install.update-stage")){throw 'Failed preparation changed the previous installation'}
 $results+=@{case='failed preparation retains previous installation';passed=$true}
 New-Item -ItemType Directory -Force "$install.update-backup" | Out-Null
 Set-Content "$install.update-backup\retained.txt" 'interrupted backup'
 Run-Fixture $good 4
 if(!(Test-Path "$install.update-backup\retained.txt")){throw 'Interrupted backup was deleted'}
 $results+=@{case='interrupted backup preserved';passed=$true}
 Remove-Item -Recurse -Force "$install.update-backup"
 New-Item -ItemType Directory -Force "$install.update-stage" | Out-Null
 Set-Content "$install.update-stage\retained.txt" 'prior stage'
 Run-Fixture $good 4
 if(!(Test-Path "$install.update-stage\retained.txt")){throw 'Prior staging directory was deleted'}
 $results+=@{case='prior staging directory preserved';passed=$true}
 Remove-Item -Recurse -Force "$install.update-stage"

 Run-Fixture $good 0 -Update
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 while(!(Test-Path "$install\restarted.txt") -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
 if(!(Test-Path "$install\restarted.txt")){throw 'Update did not relaunch app'}
 $results+=@{case='silent update relaunches app';passed=$true}
 $Output=[IO.Path]::GetFullPath((Join-Path $root $Output))
 New-Item -ItemType Directory -Force (Split-Path $Output -Parent) | Out-Null
 $results | ConvertTo-Json -Depth 5 | Set-Content $Output
 $results | Format-Table
} finally {
 Remove-Item -LiteralPath $key,$uninstallKey -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
