<#
.SYNOPSIS
    PROD-02 — Sauvegarde chiffrée de la base et des uploads Piloti, avec vérification
    de restauration.

.DESCRIPTION
    Modèle identique à deploy.ps1 (D-018) : le script tourne côté hôte, à la main ou par
    une tâche planifiée Windows. Il ne dépend d'aucun outil installé sur la machine en
    dehors de Docker — sqlite3, tar et openssl viennent d'un conteneur jetable Alpine.
    C'est délibéré : la sauvegarde doit fonctionner sur un hôte fraîchement réinstallé,
    c'est-à-dire précisément le jour où on en a besoin.

    Trois garanties, par ordre d'importance :

    1. COHÉRENCE. La base n'est jamais copiée fichier à fichier : `VACUUM INTO` produit un
       instantané transactionnellement cohérent pendant que l'application écrit. Un
       `Copy-Item` sur un SQLite vivant donne une archive corrompue de temps en temps — et
       on ne l'apprend qu'à la restauration.
    2. CHIFFREMENT. L'archive contient l'annuaire complet du groupe, mineurs inclus. Elle
       est chiffrée en AES-256 (openssl, PBKDF2) AVANT d'être écrite sur le disque de
       sortie : le fichier en clair n'existe à aucun moment hors du conteneur. La
       passphrase vient de $env:BACKUP_PASSPHRASE et n'apparaît ni dans un log, ni dans la
       ligne de commande du conteneur (`docker inspect` la révélerait).
    3. RESTAURATION VÉRIFIÉE. Avec -Verify, l'archive tout juste produite est redéchiffrée,
       réextraite et contrôlée (`PRAGMA integrity_check`, comptage des tables). Une
       sauvegarde jamais restaurée n'est pas une sauvegarde, c'est une intention.

.PARAMETER Environment
    "prod" (volumes piloti-data / piloti-uploads) ou "staging". Le staging n'a par
    définition aucune donnée réelle : n'y sauvegarder que pour tester la procédure.

.PARAMETER OutDir
    Destination des archives. Défaut : $env:PILOTI_BACKUP_DIR, sinon "$HOME\piloti-backups".

.PARAMETER RetentionDays
    Jours d'archives conservés. Défaut 30. La rotation ne tourne qu'APRÈS qu'une nouvelle
    archive a été écrite et vérifiée : on ne fait jamais de place en pariant sur une
    sauvegarde qui n'existe pas encore.

.PARAMETER Verify
    Restaure l'archive produite dans un conteneur jetable et contrôle son intégrité.
    Recommandé à chaque exécution : quelques secondes de surcoût.

.EXAMPLE
    $env:BACKUP_PASSPHRASE = "..."
    .\scripts\backup.ps1 -Environment prod -Verify

.EXAMPLE
    # Restauration vers un dossier, pour inspection avant réinjection.
    .\scripts\backup.ps1 -RestoreFrom "$HOME\piloti-backups\piloti-prod-20260823-030000.tar.gz.enc" -RestoreTo "$HOME\restore-test"
#>

[CmdletBinding(DefaultParameterSetName = 'Backup')]
param(
    [Parameter(ParameterSetName = 'Backup')]
    [ValidateSet("prod", "staging")]
    [string]$Environment = "prod",

    [Parameter(ParameterSetName = 'Backup')]
    [Parameter(ParameterSetName = 'Restore')]
    [string]$OutDir,

    [Parameter(ParameterSetName = 'Backup')]
    [int]$RetentionDays = 30,

    [Parameter(ParameterSetName = 'Backup')]
    [switch]$Verify,

    [Parameter(ParameterSetName = 'Restore', Mandatory = $true)]
    [string]$RestoreFrom,

    [Parameter(ParameterSetName = 'Restore', Mandatory = $true)]
    [string]$RestoreTo
)

$ErrorActionPreference = 'Stop'

# Image jetable : tout l'outillage vient de là, rien de l'hôte.
$toolImage = "alpine:3.21"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }

# ---------------------------------------------------------------------------
# PowerShell découpe un argument natif contenant des sauts de ligne : un script
# shell multi-lignes passé tel quel à `sh -c` arrive en morceaux. On l'encode en
# base64 — un seul jeton, sans espace ni retour à la ligne — et le conteneur le
# décode. Effet de bord utile : plus aucune couche de quoting à faire coïncider
# entre PowerShell, Docker et sh.
# ---------------------------------------------------------------------------
function ConvertTo-ShellPayload([string]$script) {
    # Les here-strings héritent des CRLF du fichier (convention .ps1 du repo).
    # busybox sh refuse une fin de ligne Windows : on normalise en LF avant
    # d'encoder, sinon la toute première instruction du script échoue.
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($script -replace "`r", "")))
}

# ---------------------------------------------------------------------------
# Passphrase. Transmise par `docker run -e NOM` (sans `=valeur`), forme qui
# reprend la variable du shell appelant sans jamais l'inscrire dans la
# configuration du conteneur.
# ---------------------------------------------------------------------------
if (-not $env:BACKUP_PASSPHRASE) {
    throw "BACKUP_PASSPHRASE absente. Générer une passphrase forte (openssl rand -base64 48), la poser dans l'environnement de l'hôte, et la conserver AILLEURS que dans les sauvegardes qu'elle protège."
}
if ($env:BACKUP_PASSPHRASE.Length -lt 20) {
    throw "BACKUP_PASSPHRASE trop courte (moins de 20 caractères) : une archive AES ne vaut que sa passphrase."
}

if (-not $OutDir) {
    $OutDir = if ($env:PILOTI_BACKUP_DIR) { $env:PILOTI_BACKUP_DIR } else { Join-Path $HOME "piloti-backups" }
}

# ===========================================================================
# MODE RESTAURATION
# ===========================================================================
if ($PSCmdlet.ParameterSetName -eq 'Restore') {
    if (-not (Test-Path $RestoreFrom)) { throw "Archive introuvable : $RestoreFrom" }
    New-Item -ItemType Directory -Force -Path $RestoreTo | Out-Null

    $srcDir = (Resolve-Path (Split-Path -Parent $RestoreFrom)).Path
    $srcName = Split-Path -Leaf $RestoreFrom
    $dstDir = (Resolve-Path $RestoreTo).Path

    Write-Step "Déchiffrement et extraction de $srcName"

    # La restauration écrit dans un DOSSIER, jamais directement dans le volume de
    # prod : réinjecter les données est une décision humaine, pas l'effet de bord
    # d'une commande de lecture.
    $restoreScript = @"
set -e
apk add --no-cache sqlite tar openssl >/dev/null 2>&1
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in '/src/$srcName' | tar xzf - -C /dst
echo '--- integrity_check ---'
sqlite3 /dst/piloti.db 'PRAGMA integrity_check;'
echo '--- comptages ---'
sqlite3 /dst/piloti.db "SELECT 'User: ' || COUNT(*) FROM User;"
sqlite3 /dst/piloti.db "SELECT 'AuditLog: ' || COUNT(*) FROM AuditLog;"
"@
    $payload = ConvertTo-ShellPayload $restoreScript
    docker run --rm -e BACKUP_PASSPHRASE -v "${srcDir}:/src:ro" -v "${dstDir}:/dst" $toolImage sh -c "echo $payload | base64 -d | sh"
    if ($LASTEXITCODE -ne 0) { throw "Échec de la restauration (passphrase erronée ou archive corrompue)." }

    Write-Ok "Restauré dans $dstDir"
    Write-Host ""
    Write-Host "Réinjection en production — acte délibéré, application arrêtée :" -ForegroundColor Yellow
    Write-Host "  docker compose -p piloti stop app"
    Write-Host "  docker run --rm -v piloti_piloti-data:/data -v `"${dstDir}:/restore:ro`" $toolImage cp /restore/piloti.db /data/piloti.db"
    Write-Host "  docker compose -p piloti start app"
    return
}

# ===========================================================================
# MODE SAUVEGARDE
# ===========================================================================
$dataVolume = if ($Environment -eq "prod") { "piloti_piloti-data" } else { "piloti-staging-data" }
$uploadsVolume = if ($Environment -eq "prod") { "piloti_piloti-uploads" } else { "piloti-staging-uploads" }

foreach ($v in @($dataVolume, $uploadsVolume)) {
    docker volume inspect $v *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Volume Docker introuvable : $v. Vérifier le nom de projet compose avec 'docker volume ls'."
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = "piloti-$Environment-$stamp.tar.gz.enc"
$outPath = (Resolve-Path $OutDir).Path

Write-Step "Sauvegarde $Environment vers $archive"

# Un seul conteneur : instantané SQLite cohérent, uploads, compression, chiffrement.
# Le .db en clair ne vit que dans la couche éphémère du conteneur et part avec lui.
$backupScript = @"
set -e
apk add --no-cache sqlite tar openssl >/dev/null 2>&1
mkdir -p /snap
sqlite3 /data/piloti.db "VACUUM INTO '/snap/piloti.db';"
cp -r /uploads /snap/uploads
tar czf - -C /snap . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out '/backup/$archive'
"@
docker run --rm -e BACKUP_PASSPHRASE `
    -v "${dataVolume}:/data:ro" `
    -v "${uploadsVolume}:/uploads:ro" `
    -v "${outPath}:/backup" `
    $toolImage sh -c "echo $(ConvertTo-ShellPayload $backupScript) | base64 -d | sh"
if ($LASTEXITCODE -ne 0) { throw "Échec de la sauvegarde — aucune archive produite, la rotation n'est pas exécutée." }

$size = "{0:N1} Mo" -f ((Get-Item (Join-Path $outPath $archive)).Length / 1MB)
Write-Ok "Archive écrite : $archive ($size)"

# ---------------------------------------------------------------------------
# Vérification : on restaure ce qu'on vient d'écrire. C'est l'étape que tout le
# monde saute, et la seule qui distingue une sauvegarde d'un fichier opaque.
# ---------------------------------------------------------------------------
if ($Verify) {
    Write-Step "Vérification par restauration réelle"
    $verifyScript = @"
set -e
apk add --no-cache sqlite tar openssl >/dev/null 2>&1
mkdir -p /t
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in '/backup/$archive' | tar xzf - -C /t
test "`$(sqlite3 /t/piloti.db 'PRAGMA integrity_check;')" = "ok"
sqlite3 /t/piloti.db "SELECT 'User: ' || COUNT(*) FROM User;"
sqlite3 /t/piloti.db "SELECT 'AuditLog: ' || COUNT(*) FROM AuditLog;"
echo "uploads: `$(find /t/uploads -type f | wc -l) fichier(s)"
"@
    docker run --rm -e BACKUP_PASSPHRASE -v "${outPath}:/backup:ro" $toolImage sh -c "echo $(ConvertTo-ShellPayload $verifyScript) | base64 -d | sh"
    if ($LASTEXITCODE -ne 0) {
        throw "ARCHIVE INEXPLOITABLE : la restauration de $archive a échoué. Ne pas la compter comme une sauvegarde."
    }
    Write-Ok "Restauration vérifiée (intégrité SQLite : ok)"
}

# ---------------------------------------------------------------------------
# Rotation — après succès uniquement.
# ---------------------------------------------------------------------------
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem -Path $outPath -Filter "piloti-$Environment-*.tar.gz.enc" |
    Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old) {
    Write-Step "Rotation : suppression de $($old.Count) archive(s) de plus de $RetentionDays jours"
    $old | Remove-Item -Force
}
$kept = @(Get-ChildItem -Path $outPath -Filter "piloti-$Environment-*.tar.gz.enc").Count
Write-Ok "$kept archive(s) en rétention dans $outPath"

# ---------------------------------------------------------------------------
# Hors-site — DESTINATION À DÉFINIR.
#
# Tant que PILOTI_BACKUP_REMOTE n'est pas posée, la sauvegarde est locale : elle
# protège d'une migration ratée ou d'une fausse manœuvre, PAS d'un vol, d'un
# incendie ni d'un chiffrement par rançongiciel — les trois scénarios pour
# lesquels on sauvegarde vraiment. L'archive étant déjà chiffrée, la destination
# n'a pas besoin d'être de confiance : n'importe quel stockage distant convient.
# ---------------------------------------------------------------------------
if ($env:PILOTI_BACKUP_REMOTE) {
    Write-Step "Copie hors-site vers $env:PILOTI_BACKUP_REMOTE"
    Copy-Item -Path (Join-Path $outPath $archive) -Destination $env:PILOTI_BACKUP_REMOTE -Force
    Write-Ok "Copie hors-site effectuée"
} else {
    Write-Host "    [!] PILOTI_BACKUP_REMOTE non définie : sauvegarde LOCALE uniquement." -ForegroundColor Yellow
}
