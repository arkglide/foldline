<# Windows PowerShell 5.1, ASCII source; bilingual dialogue JSON is explicitly UTF-8. #>
[CmdletBinding()]
param(
  [ValidateSet('l01','l02')] [string]$Level = 'l01',
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
$dataFile = Join-Path $repoRoot ("game/data/{0}-dialogue.json" -f $Level)
$data = [IO.File]::ReadAllText($dataFile, $utf8) | ConvertFrom-Json
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $installed = @($speech.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
  $installed | Select-Object Name, @{ Name = 'Culture'; Expression = { $_.Culture.Name } }, Gender | Format-Table | Out-Host
  if ($ListVoices) { return }
  if ($data.version -ne 2) { throw 'Expected version 2 English voiceText and bilingual subtitle data.' }
  $english = @($installed | Where-Object { $_.Culture.Name -match '^en-' } | Sort-Object @{ Expression = { $_.Culture.Name -ne 'en-US' } }, Name)
  if ($english.Count -eq 0) {
    throw 'No enabled offline English voice is visible to System.Speech. Install a Windows desktop English TTS voice, then rerun -ListVoices. Online and OneCore voices may not appear here.'
  }
  if (-not $OutDirectory) {
    $rawPath = if ($Level -eq 'l01') { '.cache/voice/raw' } else { '.cache/voice/l02/raw' }
    $OutDirectory = Join-Path $repoRoot $rawPath
  }
  $OutDirectory = [IO.Path]::GetFullPath($OutDirectory)
  [IO.Directory]::CreateDirectory($OutDirectory) | Out-Null
  $metadataFile = Join-Path $OutDirectory 'production.json'
  $previous = @()
  if (Test-Path $metadataFile) {
    $old = [IO.File]::ReadAllText($metadataFile, $utf8) | ConvertFrom-Json
    if ($old.version -ne 2 -or $old.engine -ne 'Windows System.Speech' -or $old.spokenLanguage -ne 'en') {
      throw "Old/non-English take metadata found. Back up $OutDirectory and assets/voice/$Level outside their active paths, then generate the English set. Stable IDs must not reuse Chinese audio."
    }
    $previous = @($old.lines)
    if (@($previous | Group-Object id | Where-Object { $_.Count -gt 1 }).Count -gt 0) { throw 'Duplicate IDs in existing production.json.' }
  }
  $selected = @{}
  foreach ($characterId in @('zhanque', 'hengwu')) {
    $settings = $data.characters.$characterId.voice
    $requested = if ($characterId -eq 'zhanque') { $ZhanqueVoice } else { $HengwuVoice }
    if (-not $requested) { $requested = $settings.windowsName }
    if ($requested) {
      $voice = $english | Where-Object { $_.Name -eq $requested } | Select-Object -First 1
      if (-not $voice) { throw "Enabled offline English voice '$requested' was not found. Copy an English voice name from -ListVoices." }
    } else {
      # Prefer a different timbre over using en-US twice; every selected voice is English.
      $usedName = if ($selected.ContainsKey('zhanque')) { $selected['zhanque'].Name } else { $null }
      $reservedName = $null
      if ($characterId -eq 'zhanque') {
        $reservedName = if ($HengwuVoice) { $HengwuVoice } else { $data.characters.hengwu.voice.windowsName }
      }
      $voice = $english | Where-Object { $_.Name -ne $usedName -and $_.Name -ne $reservedName } | Select-Object -First 1
      if (-not $voice) { $voice = $english[0] }
    }
    $selected[$characterId] = $voice
    Write-Host ("{0}: {1} ({2})" -f $characterId, $voice.Name, $voice.Culture.Name)
  }
  if ($selected['zhanque'].Name -eq $selected['hengwu'].Name) {
    if ($english.Count -eq 1) {
      Write-Warning 'Only ONE offline English timbre is available. Both roles use it; rate and filters differ, but this is not two distinct voices.'
    } else {
      Write-Warning 'Both roles selected the SAME timbre. Choose different installed English voices with -ZhanqueVoice and -HengwuVoice if desired.'
    }
  }
  $format = New-Object -TypeName System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList @(
    22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)
  $records = @()
  $selectedLines = @($data.lines | Where-Object { -not $Ids -or $Ids -contains $_.id })
  if ($Ids -and $selectedLines.Count -ne $Ids.Count) { throw 'An -Ids value is unknown or duplicated.' }
  foreach ($line in $selectedLines) {
    if ($line.id -notmatch '^[A-Za-z0-9_-]+$') { throw "Unsafe line ID: $($line.id)" }
    if (-not ($line.voiceText -is [string]) -or [string]::IsNullOrWhiteSpace($line.voiceText) -or $line.subtitles.en -cne $line.voiceText) {
      throw "Expected matching English voiceText and subtitles.en for $($line.id). Chinese subtitles are never sent to TTS."
    }
    if (-not $selected.ContainsKey($line.character)) { throw "Unknown character for $($line.id)" }
    $character = $data.characters.($line.character)
    $voice = $selected[$line.character]
    $speech.SelectVoice($voice.Name)
    $speech.Rate = [int]$character.voice.rate
    $speech.Volume = [int]$character.voice.volume
    $target = Join-Path $OutDirectory ($line.id + '.wav')
    $speech.SetOutputToWaveFile($target, $format)
    # Plain-text Speak is supported by desktop SAPI/System.Speech on Win10/11.
    # Punctuation carries pauses; this path does not require SSML support.
    try { $speech.Speak([string]$line.voiceText) }
    finally { $speech.SetOutputToNull() }
    if ((Get-Item $target).Length -le 44) { throw "Empty speech file: $target" }
    $records += [PSCustomObject]@{
      id = $line.id; character = $line.character; voiceText = $line.voiceText;
      file = $line.id + '.wav'; voice = $voice.Name; culture = $voice.Culture.Name;
      rate = [int]$speech.Rate; volume = [int]$speech.Volume;
      sha256 = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant()
    }
    Write-Host "Generated $($line.id): $($voice.Name)"
  }
  # Preserve the provenance of untouched takes during -Ids regeneration.
  $newIds = @($records | ForEach-Object { $_.id })
  $untouched = @($previous | Where-Object { $newIds -notcontains $_.id })
  $metadata = [PSCustomObject]@{
    version = 2; engine = 'Windows System.Speech'; spokenLanguage = 'en';
    windowsVersion = [Environment]::OSVersion.VersionString;
    generatedAt = [DateTime]::UtcNow.ToString('o'); lines = @($untouched) + @($records)
  }
  [IO.File]::WriteAllText($metadataFile, ($metadata | ConvertTo-Json -Depth 8), $utf8)
  Write-Host "Raw English takes: $OutDirectory"
  Write-Host 'Next: node scripts/voice-assets.mjs --process'
}
finally { $speech.Dispose() }
