# Install okzCODE VS Code extension
$dest = "$env:USERPROFILE\.vscode\extensions\okzcode-language-0.1.0"
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Copy-Item -Recurse "$PSScriptRoot" "$dest"
Write-Host "Installed okzCODE extension to $dest"
Write-Host "Restart VS Code to activate"