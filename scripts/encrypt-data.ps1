#Requires -Version 7.2

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $DataPath,

    [Parameter(Mandatory = $true)]
    [SecureString] $EncryptionKey,

    [Parameter()]
    [string] $OutputDirectory,

    [Parameter()]
    [string] $CachePath
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][byte[]] $Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString($sha256.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-HmacSha256Bytes {
    param(
        [Parameter(Mandatory = $true)][byte[]] $Key,
        [Parameter(Mandatory = $true)][byte[]] $Bytes
    )

    $hmac = [System.Security.Cryptography.HMACSHA256]::new($Key)
    try {
        return $hmac.ComputeHash($Bytes)
    }
    finally {
        $hmac.Dispose()
    }
}

function Test-BytesEqualConstantTime {
    param(
        [Parameter(Mandatory = $true)][byte[]] $First,
        [Parameter(Mandatory = $true)][byte[]] $Second
    )

    if ($First.Length -ne $Second.Length) {
        return $false
    }

    $difference = 0
    for ($index = 0; $index -lt $First.Length; $index++) {
        $difference = $difference -bor ($First[$index] -bxor $Second[$index])
    }
    return $difference -eq 0
}

function Get-CachePayload {
    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append("travel-map-encrypt-data-cache-v1`n")
    [void]$builder.Append($script:cacheKeyId).Append("`n")
    foreach ($entry in $script:cacheEntries.GetEnumerator()) {
        [void]$builder.Append($entry.Key).Append("`n")
        [void]$builder.Append($entry.Value).Append("`n")
    }

    return [System.Text.UTF8Encoding]::new($false).GetBytes($builder.ToString())
}

function Save-EncryptionCache {
    $mac = [System.Convert]::ToBase64String((Get-HmacSha256Bytes -Key $script:cacheKey -Bytes (Get-CachePayload)))
    $serializedEntries = [ordered]@{}
    foreach ($entry in $script:cacheEntries.GetEnumerator()) {
        $serializedEntries[$entry.Key] = $entry.Value
    }

    $cacheDocument = [ordered]@{
        version = 1
        keyId = $script:cacheKeyId
        entries = $serializedEntries
        mac = $mac
    }
    $cacheJson = ConvertTo-Json -InputObject $cacheDocument -Depth 5
    $tempSuffix = [System.Guid]::NewGuid().ToString('N')
    $tempPath = "$CachePath.$tempSuffix.tmp"
    $backupPath = "$CachePath.$tempSuffix.bak"
    try {
        [System.IO.File]::WriteAllText($tempPath, $cacheJson, [System.Text.UTF8Encoding]::new($false))
        if ([System.IO.File]::Exists($CachePath)) {
            [System.IO.File]::Replace($tempPath, $CachePath, $backupPath)
            [System.IO.File]::Delete($backupPath)
        }
        else {
            [System.IO.File]::Move($tempPath, $CachePath)
        }
    }
    finally {
        if ([System.IO.File]::Exists($tempPath)) {
            [System.IO.File]::Delete($tempPath)
        }
        if ([System.IO.File]::Exists($backupPath)) {
            [System.IO.File]::Delete($backupPath)
        }
    }
}

function Initialize-EncryptionCache {
    $script:cacheEntries = [System.Collections.Generic.SortedDictionary[string, string]]::new(
        [System.StringComparer]::Ordinal
    )
    $script:usedIvValues = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )

    if (-not [System.IO.File]::Exists($CachePath)) {
        return
    }

    $cacheDocument = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($CachePath, [System.Text.Encoding]::UTF8)) -AsHashtable
    if ($cacheDocument -isnot [System.Collections.IDictionary] -or $cacheDocument.version -ne 1) {
        throw "The encryption cache has an unsupported or invalid format: $CachePath"
    }
    if ($cacheDocument.keyId -cne $script:cacheKeyId) {
        throw "The encryption cache belongs to a different encryption key. Choose a new -CachePath or restore the matching key."
    }
    if ($cacheDocument.entries -isnot [System.Collections.IDictionary] -or $cacheDocument.mac -isnot [string]) {
        throw "The encryption cache is missing required fields: $CachePath"
    }

    foreach ($entry in $cacheDocument.entries.GetEnumerator()) {
        if ($entry.Key -notmatch '^[0-9a-f]{64}$' -or $entry.Value -isnot [string]) {
            throw "The encryption cache contains an invalid entry: $CachePath"
        }
        try {
            $iv = [System.Convert]::FromBase64String($entry.Value)
        }
        catch {
            throw "The encryption cache contains an invalid IV: $CachePath"
        }
        if ($iv.Length -ne 12 -or -not $script:usedIvValues.Add($entry.Value)) {
            throw "The encryption cache contains an invalid or reused IV: $CachePath"
        }
        $script:cacheEntries.Add($entry.Key, $entry.Value)
    }

    try {
        $storedMac = [System.Convert]::FromBase64String($cacheDocument.mac)
    }
    catch {
        throw "The encryption cache has an invalid authentication code: $CachePath"
    }
    $actualMac = Get-HmacSha256Bytes -Key $script:cacheKey -Bytes (Get-CachePayload)
    if ($storedMac.Length -ne $actualMac.Length -or
        -not (Test-BytesEqualConstantTime -First $storedMac -Second $actualMac)) {
        throw "The encryption cache failed authentication and will not be used: $CachePath"
    }
}

function Convert-LocalFileUri {
    param([Parameter(Mandatory = $true)][string] $Uri)

    $isEncrypted = $false
    if ($Uri.StartsWith('encrypted:', [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativeUri = [System.Uri]::UnescapeDataString($Uri.Substring('encrypted:'.Length))
        if (-not ($relativeUri.StartsWith('./') -or $relativeUri.StartsWith('.\'))) {
            return $Uri
        }
        $isEncrypted = $true
    }
    elseif ($Uri.StartsWith('./') -or $Uri.StartsWith('.\')) {
        $relativeUri = [System.Uri]::UnescapeDataString($Uri)
    }
    else {
        return $Uri
    }

    $relativePath = $relativeUri.Substring(2).Replace('/', [System.IO.Path]::DirectorySeparatorChar).Replace('\', [System.IO.Path]::DirectorySeparatorChar)
    $sourcePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($sourceDirectory, $relativePath))
    if (-not [System.IO.File]::Exists($sourcePath)) {
        throw "Local file referenced by '$Uri' was not found: $sourcePath"
    }

    $fileBytes = [System.IO.File]::ReadAllBytes($sourcePath)
    if ($isEncrypted) {
        $outputBytes = $fileBytes
    }
    else {
        $plainHash = Get-Sha256Hex -Bytes $fileBytes
        $fingerprintMessage = [System.Text.UTF8Encoding]::new($false).GetBytes("travel-map-file-v1:$plainHash")
        $fingerprint = [System.BitConverter]::ToString(
            (Get-HmacSha256Bytes -Key $cacheKey -Bytes $fingerprintMessage)
        ).Replace('-', '').ToLowerInvariant()

        if ($script:cacheEntries.ContainsKey($fingerprint)) {
            $iv = [System.Convert]::FromBase64String($script:cacheEntries[$fingerprint])
        }
        else {
            $iv = New-Object byte[] 12
            $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            try {
                do {
                    $random.GetBytes($iv)
                    $ivValue = [System.Convert]::ToBase64String($iv)
                } while ($script:usedIvValues.Contains($ivValue))
            }
            finally {
                $random.Dispose()
            }

            $script:cacheEntries.Add($fingerprint, $ivValue)
            [void]$script:usedIvValues.Add($ivValue)
            Save-EncryptionCache
        }

        $ciphertext = New-Object byte[] $fileBytes.Length
        $tag = New-Object byte[] 16
        $aes.Encrypt($iv, $fileBytes, $ciphertext, $tag)
        $outputBytes = New-Object byte[] ($iv.Length + $ciphertext.Length + $tag.Length)
        [System.Buffer]::BlockCopy($iv, 0, $outputBytes, 0, $iv.Length)
        [System.Buffer]::BlockCopy($ciphertext, 0, $outputBytes, $iv.Length, $ciphertext.Length)
        [System.Buffer]::BlockCopy($tag, 0, $outputBytes, $iv.Length + $ciphertext.Length, $tag.Length)
    }

    $fileName = Get-Sha256Hex -Bytes $outputBytes
    $destinationPath = [System.IO.Path]::Combine($OutputDirectory, $fileName)
    [System.IO.File]::WriteAllBytes($destinationPath, $outputBytes)

    return "encrypted:./$fileName"
}

$dataPathFull = [System.IO.Path]::GetFullPath($DataPath)
if (-not [System.IO.File]::Exists($dataPathFull)) {
    throw "Data file was not found: $dataPathFull"
}
$sourceDirectory = [System.IO.Path]::GetDirectoryName($dataPathFull)

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $timestamp = [System.DateTime]::Now.ToString('yyyyMMdd-HHmmss', [System.Globalization.CultureInfo]::InvariantCulture)
    $OutputDirectory = [System.IO.Path]::Combine($sourceDirectory, "__encrypted-$timestamp")
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$outputJsonPath = [System.IO.Path]::Combine($OutputDirectory, 'data.json')
if ([string]::Equals($outputJsonPath, $dataPathFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The output data.json must not overwrite the input file. Choose a different output directory.'
}
if ([string]::IsNullOrWhiteSpace($CachePath)) {
    $CachePath = [System.IO.Path]::Combine($PSScriptRoot, 'encrypt-data.json')
}
$CachePath = [System.IO.Path]::GetFullPath($CachePath)
$cacheDirectory = [System.IO.Path]::GetDirectoryName($CachePath)
[System.IO.Directory]::CreateDirectory($cacheDirectory) | Out-Null

$jsonText = [System.IO.File]::ReadAllText($dataPathFull, [System.Text.Encoding]::UTF8)
$root = [System.Text.Json.Nodes.JsonNode]::Parse($jsonText)
if ($root -isnot [System.Text.Json.Nodes.JsonObject]) {
    throw 'The data file must contain a JSON object at its root.'
}

$keyPointer = [IntPtr]::Zero
$keyCharacters = [char[]]@()
$keyMaterial = [byte[]]@()
$keyBytes = [byte[]]@()
$cacheKey = [byte[]]@()
$script:cacheKey = [byte[]]@()
$aes = $null
try {
    $keyPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($EncryptionKey)
    $keyCharacters = New-Object char[] $EncryptionKey.Length
    if ($keyCharacters.Length -gt 0) {
        [System.Runtime.InteropServices.Marshal]::Copy($keyPointer, $keyCharacters, 0, $keyCharacters.Length)
    }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $keyMaterial = $utf8.GetBytes($keyCharacters)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $keyBytes = $sha256.ComputeHash($keyMaterial)
    }
    finally {
        $sha256.Dispose()
    }
    [System.Array]::Clear($keyCharacters, 0, $keyCharacters.Length)
    [System.Array]::Clear($keyMaterial, 0, $keyMaterial.Length)

    $cacheKeyContext = [System.Text.UTF8Encoding]::new($false).GetBytes('travel-map-encrypt-data-cache-key-v1')
    $script:cacheKey = Get-HmacSha256Bytes -Key $keyBytes -Bytes $cacheKeyContext
    $cacheKeyIdContext = [System.Text.UTF8Encoding]::new($false).GetBytes('travel-map-encrypt-data-cache-id-v1')
    $script:cacheKeyId = [System.BitConverter]::ToString(
        (Get-HmacSha256Bytes -Key $script:cacheKey -Bytes $cacheKeyIdContext)
    ).Replace('-', '').ToLowerInvariant()

    Initialize-EncryptionCache

    $aes = [System.Security.Cryptography.AesGcm]::new($keyBytes)
    [System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

    $places = $root['places']
    if ($places -is [System.Text.Json.Nodes.JsonArray]) {
        foreach ($place in $places) {
            if ($place -isnot [System.Text.Json.Nodes.JsonObject]) {
                continue
            }

            foreach ($collectionName in @('gallery', 'tracks')) {
                $items = $place[$collectionName]
                if ($items -isnot [System.Text.Json.Nodes.JsonArray]) {
                    continue
                }

                for ($index = 0; $index -lt $items.Count; $index++) {
                    $item = $items[$index]
                    if ($item -isnot [System.Text.Json.Nodes.JsonValue]) {
                        continue
                    }
                    if ($item.GetValueKind() -ne [System.Text.Json.JsonValueKind]::String) {
                        continue
                    }

                    $uri = $item.ToString()
                    $updatedUri = Convert-LocalFileUri -Uri $uri
                    if ($updatedUri -cne $uri) {
                        $items[$index] = [System.Text.Json.Nodes.JsonValue]::Create($updatedUri)
                    }
                }
            }
        }
    }

    $jsonOptions = [System.Text.Json.JsonSerializerOptions]::new()
    $jsonOptions.WriteIndented = $true
    # The output is a standalone JSON file, not JSON embedded in HTML.
    $jsonOptions.Encoder = [System.Text.Encodings.Web.JavaScriptEncoder]::UnsafeRelaxedJsonEscaping
    $outputJson = $root.ToJsonString($jsonOptions) + [System.Environment]::NewLine
    [System.IO.File]::WriteAllText(
        $outputJsonPath,
        $outputJson,
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Output "Encrypted data written to: $OutputDirectory"
}
finally {
    if ($null -ne $aes) {
        $aes.Dispose()
    }
    if ($keyCharacters.Length -gt 0) {
        [System.Array]::Clear($keyCharacters, 0, $keyCharacters.Length)
    }
    if ($keyMaterial.Length -gt 0) {
        [System.Array]::Clear($keyMaterial, 0, $keyMaterial.Length)
    }
    if ($keyBytes.Length -gt 0) {
        [System.Array]::Clear($keyBytes, 0, $keyBytes.Length)
    }
    if ($script:cacheKey.Length -gt 0) {
        [System.Array]::Clear($script:cacheKey, 0, $script:cacheKey.Length)
    }
    if ($keyPointer -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
}
