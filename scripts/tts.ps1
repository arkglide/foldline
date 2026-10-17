<# Windows PowerShell 5.1, ASCII source; dialogue JSON is explicitly read as UTF-8. #>
[CmdletBinding()]
param(
  [switch]$ListVoices,
  [string]$ZhanqueVoice,
  [string]$HengwuVoice,
  [string]$OutDirectory,
  [string[]]$Ids
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This tool requires Windows and an installed offline System.Speech voice. No cloud TTS fallback is used.'
}
Add-Type -AssemblyName System.Speech
$repoRoot = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$dataFile = Join-Path $repoRoot 'game/data/l01-dialogue.json'
$data = [IO.File]::ReadAllText($dataFile, $utf8) | ConvertFrom-Json
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $installed = @($speech.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
  $installed | Select-Object Name, @{ Name = 'Culture'; Expression = { $_.Culture.Name } }, Gender | Format-Table | Out-Host
  if ($ListVoices) { return }
  if (-not $OutDirectory) { $OutDirectory = Join-Path $repoRoot '.cache/voice/raw' }
  $OutDirectory = [IO.Path]::GetFullPath($OutDirectory)
  [IO.Directory]::CreateDirectory($OutDirectory) | Out-Null
  $selected = @{}
  foreach ($characterId in @('zhanque', 'hengwu')) {
    $settings = $data.characters.$characterId.voice
    $requested = if ($characterId -eq 'zhanque') { $ZhanqueVoice } else { $HengwuVoice }
    if (-not $requested) { $requested = $settings.windowsName }
    $candidates = @($installed | Where-Object { $_.Culture.Name -eq $settings.culture })
    if ($requested) {
      $voice = $candidates | Where-Object { $_.Name -eq $requested } | Select-Object -First 1
      if (-not $voice) { throw "Installed enabled voice '$requested' with culture '$($settings.culture)' was not found." }
    } else {
      if ($candidates.Count -eq 0) { throw "No enabled offline voice for '$($settings.culture)'. Install a Windows desktop TTS voice, then rerun -ListVoices." }
      $voice = $candidates | Where-Object { $_.Name -ne $selected['zhanque'] } | Select-Object -First 1
      if (-not $voice) { $voice = $candidates[0] }
    }
    $selected[$characterId] = $voice.Name
  }
  if ($selected['zhanque'] -eq $selected['hengwu']) {
    Write-Warning 'Only one timbre was selected. Roles use different rate and offline filters; audition and select another installed Chinese voice when available.'
  }
  $format = New-Object -TypeName System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList @(
    22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)
  $records = @()
  $selectedLines = @($data.lines | Where-Object { -not $Ids -or $Ids -contains $_.id })
  if ($Ids -and $selectedLines.Count -ne $Ids.Count) { throw 'An -Ids value is unknown or duplicated.' }
  foreach ($line in $selectedLines) {
    if ($line.id -notmatch '^[A-Za-z0-9_-]+$') { throw "Unsafe line ID: $($line.id)" }
    $character = $data.characters.($line.character)
    $voiceName = $selected[$line.character]
    $speech.SelectVoice($voiceName)
    $speech.Rate = [int]$character.voice.rate
    $speech.Volume = [int]$character.voice.volume
    $target = Join-Path $OutDirectory ($line.id + '.wav')
    $speech.SetOutputToWaveFile($target, $format)
    try { $speech.Speak([string]$line.subtitle) }
    finally { $speech.SetOutputToNull() }
    if ((Get-Item $target).Length -le 44) { throw "Empty speech file: $target" }
    $records += [PSCustomObject]@{
      id = $line.id; character = $line.character; text = $line.subtitle;
      file = $line.id + '.wav'; voice = $voiceName;
      culture = $character.voice.culture; rate = [int]$character.voice.rate;
      sha256 = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant()
    }
    Write-Host "Generated $($line.id): $voiceName"
  }
  # Merge partial takes so -Ids can regenerate a single sentence without losing provenance.
  $metadataFile = Join-Path $OutDirectory 'production.json'
  $previous = @()
  if (Test-Path $metadataFile) {
    $old = [IO.File]::ReadAllText($metadataFile, $utf8) | ConvertFrom-Json
    if ($old.engine -eq 'Windows System.Speech') {
      $newIds = @($records | ForEach-Object { $_.id })
      $previous = @($old.lines | Where-Object { $newIds -notcontains $_.id })
    }
  }
  $metadata = [PSCustomObject]@{
    version = 1; engine = 'Windows System.Speech';
    windowsVersion = [Environment]::OSVersion.VersionString;
    generatedAt = [DateTime]::UtcNow.ToString('o'); lines = @($previous) + @($records)
  }
  [IO.File]::WriteAllText($metadataFile, ($metadata | ConvertTo-Json -Depth 8), $utf8)
  Write-Host "Raw takes: $OutDirectory"
  Write-Host 'Next: node scripts/voice-assets.mjs --process'
}
finally { $speech.Dispose() }
