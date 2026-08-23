<#
.SYNOPSIS
    PROD-02 — Sauvegarde chiffrée de la base et des uploads Piloti, avec vérification
    par restauration réelle.

.DESCRIPTION
    Modèle identique à deploy.ps1 (D-018) : le script tourne côté hôte, à la main ou par
    une tâche planifiée Windows. Il ne dépend d'aucun outil installé sur la machine en
    dehors de Docker — sqlite3, tar et age viennent d'un conteneur jetable Alpine. C'est
    délibéré : la sauvegarde doit fonctionner sur un hôte fraîchement réinstallé,
    c'est-à-dire précisément le jour où on en a besoin.

    Trois garanties, par ordre d'importance :

    1. COHÉRENCE. La base n'est jamais copiée fichier à fichier : `VACUUM INTO` produit un
       instantané transactionnellement cohérent pendant que l'application écrit. Un
       `Copy-Item` sur un SQLite vivant donne une archive corrompue de temps en temps — et
       on ne l'apprend qu'à la restauration.

    2. CHIFFREMENT AUTHENTIFIÉ, À CLÉ PUBLIQUE. L'archive contient l'annuaire complet du
       groupe, mineurs inclus. Elle est chiffrée avec `age` (ChaCha20-Poly1305) dans le
       tube, avant d'être écrite : le `.db` en clair n'existe à aucun moment hors du
       conteneur. Deux propriétés en découlent, qu'une passphrase seule ne donne pas :

       - Une archive modifiée est REJETÉE au déchiffrement, pas restaurée à moitié. Cela
         compte dès que les archives partent sur une destination hors-site où quelqu'un
         d'autre peut écrire.
       - L'hôte ne détient que la clé PUBLIQUE (BACKUP_AGE_RECIPIENT). Il produit donc des
         sauvegardes sans jamais pouvoir les relire : une machine compromise ou chiffrée
         par un rançongiciel n'ouvre pas l'historique. La clé privée ne sert qu'à
         restaurer et se garde hors de cette machine.

    3. RESTAURATION VÉRIFIÉE. `-Verify` redéchiffre, réextrait et contrôle l'archive tout
       juste écrite (`PRAGMA integrity_check`, comptage `User`/`AuditLog`). Cela EXIGE la
       clé privée : c'est le prix du point 2. Voir .NOTES — sauvegarde quotidienne sans
       clé privée, vérification périodique avec.

.PARAMETER Environment
    "prod" (volumes piloti-data / piloti-uploads) ou "staging". Le staging n'a par
    définition aucune donnée réelle : n'y sauvegarder que pour tester la procédure.

.PARAMETER OutDir
    Destination des archives. Défaut : $env:PILOTI_BACKUP_DIR, sinon "$HOME\piloti-backups".

.PARAMETER RetentionDays
    Jours d'archives conservés. Défaut 30. La rotation ne tourne qu'APRÈS qu'une nouvelle
    archive a été écrite (et vérifiée si -Verify) : on ne fait jamais de place en pariant
    sur une sauvegarde qui n'existe pas encore.

.PARAMETER Verify
    Restaure réellement l'archive produite dans un conteneur jetable et contrôle son
    intégrité. Nécessite $env:BACKUP_AGE_IDENTITY.

.NOTES
    GÉNÉRATION DES CLÉS (une fois) :
        docker run --rm alpine:3.21 sh -c "apk add --no-cache age >/dev/null && age-keygen"

    La sortie contient la clé privée (AGE-SECRET-KEY-...) et, en commentaire, la clé
    publique (age1...).
      - Clé PUBLIQUE -> BACKUP_AGE_RECIPIENT, sur l'hôte de sauvegarde. Non sensible.
      - Clé PRIVÉE   -> fichier conservé AILLEURS que sur cette machine et AILLEURS que
                        dans les archives qu'elle protège. La perdre rend toutes les
                        sauvegardes définitivement illisibles.

    EXPLOITATION RECOMMANDÉE :
      - Tâche planifiée quotidienne : sans -Verify, sans clé privée sur l'hôte. Sécurité
        maximale, l'hôte ne peut pas relire ses propres sauvegardes.
      - Vérification périodique (mensuelle) : à la main, clé privée montée le temps de
        l'opération. C'est le vrai test de restauration.

.EXAMPLE
    $env:BACKUP_AGE_RECIPIENT = "age1..."
    .\scripts\backup.ps1 -Environment prod

.EXAMPLE
    # Vérification périodique, clé privée temporairement disponible.
    $env:BACKUP_AGE_IDENTITY = "D:\cles\piloti-backup.key"
    .\scripts\backup.ps1 -Environment prod -Verify

.EXAMPLE
    # Restauration vers un dossier, pour inspection avant réinjection.
    $env:BACKUP_AGE_IDENTITY = "D:\cles\piloti-backup.key"
    .\scripts\backup.ps1 -RestoreFrom "$HOME\piloti-backups\piloti-prod-20260823-030000.tar.gz.age" -RestoreTo "$HOME\restore-test"
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

# Résout le fichier de clé privée, ou explique pourquoi il est requis.
function Resolve-Identity([string]$usage) {
    if (-not $env:BACKUP_AGE_IDENTITY) {
        throw "BACKUP_AGE_IDENTITY absente : $usage exige la cle privee age. C'est le revers assume du chiffrement a cle publique — l'hote de sauvegarde ne peut pas relire ses propres archives. Monter la cle le temps de l'operation, puis la retirer."
    }
    if (-not (Test-Path $env:BACKUP_AGE_IDENTITY)) {
        throw "Fichier de cle privee introuvable : $($env:BACKUP_AGE_IDENTITY)"
    }
    return (Resolve-Path $env:BACKUP_AGE_IDENTITY).Path
}

if (-not $OutDir) {
    $OutDir = if ($env:PILOTI_BACKUP_DIR) { $env:PILOTI_BACKUP_DIR } else { Join-Path $HOME "piloti-backups" }
}

# ===========================================================================
# MODE RESTAURATION
# ===========================================================================
if ($PSCmdlet.ParameterSetName -eq 'Restore') {
    if (-not (Test-Path $RestoreFrom)) { throw "Archive introuvable : $RestoreFrom" }
    $identityPath = Resolve-Identity "la restauration"
    New-Item -ItemType Directory -Force -Path $RestoreTo | Out-Null

    $srcDir = (Resolve-Path (Split-Path -Parent $RestoreFrom)).Path
    $srcName = Split-Path -Leaf $RestoreFrom
    $dstDir = (Resolve-Path $RestoreTo).Path
    $identityDir = Split-Path -Parent $identityPath
    $identityName = Split-Path -Leaf $identityPath

    Write-Step "Dechiffrement et extraction de $srcName"

    # La restauration écrit dans un DOSSIER, jamais directement dans le volume de
    # prod : réinjecter les données est une décision humaine, pas l'effet de bord
    # d'une commande de lecture.
    $restoreScript = @"
set -e
apk add --no-cache sqlite tar age >/dev/null 2>&1
age -d -i '/key/$identityName' '/src/$srcName' | tar xzf - -C /dst
echo '--- integrity_check ---'
sqlite3 /dst/piloti.db 'PRAGMA integrity_check;'
echo '--- comptages ---'
sqlite3 /dst/piloti.db "SELECT 'User: ' || COUNT(*) FROM User;"
sqlite3 /dst/piloti.db "SELECT 'AuditLog: ' || COUNT(*) FROM AuditLog;"
"@
    docker run --rm `
        -v "${srcDir}:/src:ro" `
        -v "${identityDir}:/key:ro" `
        -v "${dstDir}:/dst" `
        $toolImage sh -c "echo $(ConvertTo-ShellPayload $restoreScript) | base64 -d | sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Echec de la restauration : mauvaise cle, ou archive corrompue/falsifiee. age rejette une archive modifiee plutot que de la restaurer a moitie."
    }

    Write-Ok "Restaure dans $dstDir"
    Write-Host ""
    Write-Host "Reinjection en production — acte delibere, application arretee :" -ForegroundColor Yellow
    Write-Host "  docker compose -p piloti stop app"
    Write-Host "  docker run --rm -v piloti_piloti-data:/data -v `"${dstDir}:/restore:ro`" $toolImage cp /restore/piloti.db /data/piloti.db"
    Write-Host "  docker compose -p piloti start app"
    return
}

# ===========================================================================
# MODE SAUVEGARDE
# ===========================================================================
if (-not $env:BACKUP_AGE_RECIPIENT) {
    throw "BACKUP_AGE_RECIPIENT absente. Generer une paire de cles (voir .NOTES de ce script), poser la cle PUBLIQUE age1... ici, et conserver la cle privee hors de cette machine."
}
if ($env:BACKUP_AGE_RECIPIENT -notmatch '^age1[0-9a-z]{50,}$') {
    throw "BACKUP_AGE_RECIPIENT ne ressemble pas a une cle publique age (attendu : age1...). Ne surtout pas y mettre la cle privee AGE-SECRET-KEY-... : elle finirait sur la machine que le chiffrement doit proteger."
}
$recipient = $env:BACKUP_AGE_RECIPIENT

# La vérification exige la clé privée : on le découvre AVANT de sauvegarder, pas
# après, pour ne jamais laisser croire qu'une archive a été contrôlée.
$identityPath = $null
if ($Verify) { $identityPath = Resolve-Identity "la verification par restauration" }

$dataVolume = if ($Environment -eq "prod") { "piloti_piloti-data" } else { "piloti-staging-data" }
$uploadsVolume = if ($Environment -eq "prod") { "piloti_piloti-uploads" } else { "piloti-staging-uploads" }

foreach ($v in @($dataVolume, $uploadsVolume)) {
    docker volume inspect $v *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Volume Docker introuvable : $v. Verifier le nom de projet compose avec 'docker volume ls'."
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = "piloti-$Environment-$stamp.tar.gz.age"
$outPath = (Resolve-Path $OutDir).Path

Write-Step "Sauvegarde $Environment vers $archive"

# Un seul conteneur : instantané SQLite cohérent, uploads, compression, chiffrement.
# Le .db en clair ne vit que dans la couche éphémère du conteneur et part avec lui.
$backupScript = @"
set -e
apk add --no-cache sqlite tar age >/dev/null 2>&1
mkdir -p /snap
sqlite3 /data/piloti.db "VACUUM INTO '/snap/piloti.db';"
cp -r /uploads /snap/uploads
tar czf - -C /snap . | age -r '$recipient' -o '/backup/$archive'
"@
docker run --rm `
    -v "${dataVolume}:/data:ro" `
    -v "${uploadsVolume}:/uploads:ro" `
    -v "${outPath}:/backup" `
    $toolImage sh -c "echo $(ConvertTo-ShellPayload $backupScript) | base64 -d | sh"
if ($LASTEXITCODE -ne 0) { throw "Echec de la sauvegarde — aucune archive produite, la rotation n'est pas executee." }

$size = "{0:N1} Mo" -f ((Get-Item (Join-Path $outPath $archive)).Length / 1MB)
Write-Ok "Archive ecrite : $archive ($size)"

# ---------------------------------------------------------------------------
# Vérification : on restaure ce qu'on vient d'écrire. C'est l'étape que tout le
# monde saute, et la seule qui distingue une sauvegarde d'un fichier opaque.
# ---------------------------------------------------------------------------
if ($Verify) {
    Write-Step "Verification par restauration reelle"
    $identityDir = Split-Path -Parent $identityPath
    $identityName = Split-Path -Leaf $identityPath
    $verifyScript = @"
set -e
apk add --no-cache sqlite tar age >/dev/null 2>&1
mkdir -p /t
age -d -i '/key/$identityName' '/backup/$archive' | tar xzf - -C /t
test "`$(sqlite3 /t/piloti.db 'PRAGMA integrity_check;')" = "ok"
sqlite3 /t/piloti.db "SELECT 'User: ' || COUNT(*) FROM User;"
sqlite3 /t/piloti.db "SELECT 'AuditLog: ' || COUNT(*) FROM AuditLog;"
echo "uploads: `$(find /t/uploads -type f | wc -l) fichier(s)"
"@
    docker run --rm `
        -v "${outPath}:/backup:ro" `
        -v "${identityDir}:/key:ro" `
        $toolImage sh -c "echo $(ConvertTo-ShellPayload $verifyScript) | base64 -d | sh"
    if ($LASTEXITCODE -ne 0) {
        throw "ARCHIVE INEXPLOITABLE : la restauration de $archive a echoue. Ne pas la compter comme une sauvegarde."
    }
    Write-Ok "Restauration verifiee (integrite SQLite : ok)"
} else {
    Write-Host "    [i] Archive non verifiee (-Verify exige la cle privee). Prevoir une verification periodique." -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Rotation — après succès uniquement.
# ---------------------------------------------------------------------------
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem -Path $outPath -Filter "piloti-$Environment-*.tar.gz.age" |
    Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old) {
    Write-Step "Rotation : suppression de $($old.Count) archive(s) de plus de $RetentionDays jours"
    $old | Remove-Item -Force
}
$kept = @(Get-ChildItem -Path $outPath -Filter "piloti-$Environment-*.tar.gz.age").Count
Write-Ok "$kept archive(s) en retention dans $outPath"

# ---------------------------------------------------------------------------
# Hors-site — DESTINATION À DÉFINIR.
#
# Tant que PILOTI_BACKUP_REMOTE n'est pas posée, la sauvegarde est locale : elle
# protège d'une migration ratée ou d'une fausse manœuvre, PAS d'un vol, d'un
# incendie ni d'un chiffrement par rançongiciel — les trois scénarios pour
# lesquels on sauvegarde vraiment. L'archive étant chiffrée ET authentifiée, la
# destination n'a besoin d'être ni de confiance ni protégée en écriture : une
# archive altérée sera rejetée à la restauration.
# ---------------------------------------------------------------------------
if ($env:PILOTI_BACKUP_REMOTE) {
    Write-Step "Copie hors-site vers $env:PILOTI_BACKUP_REMOTE"
    Copy-Item -Path (Join-Path $outPath $archive) -Destination $env:PILOTI_BACKUP_REMOTE -Force
    Write-Ok "Copie hors-site effectuee"
} else {
    Write-Host "    [!] PILOTI_BACKUP_REMOTE non definie : sauvegarde LOCALE uniquement." -ForegroundColor Yellow
}
