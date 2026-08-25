<#
.SYNOPSIS
    PROD-02 — enregistre la sauvegarde quotidienne de Piloti dans le planificateur
    de tâches Windows.

.DESCRIPTION
    Dernier volet de PROD-02 : « automatisée ». Le chiffrement et la restauration
    vérifiée sont livrés par `backup.ps1` ; ce script-ci fait qu'ils tournent sans
    qu'on y pense.

    DEUX PARTIS PRIS, tous deux délibérés.

    1. La tâche s'exécute SANS la clé privée. Elle ne passe donc pas `-Verify` :
       l'hôte ne peut pas relire ses propres archives, et c'est tout l'intérêt du
       chiffrement à clé publique (cf. D-030). La vérification reste un geste
       manuel, périodique, avec la clé montée le temps de l'opération.

    2. Les variables sont lues depuis le `.env.production` du répertoire de
       DÉPLOIEMENT, pas du dépôt. C'est le fichier qui fait autorité (cf.
       `deploy.ps1`), et le seul qui contienne les vraies valeurs.

    La tâche journalise chaque exécution et signale les échecs : une sauvegarde
    silencieuse qui ne tourne plus est pire que pas de sauvegarde du tout, parce
    qu'on croit être protégé.

.PARAMETER Heure
    Heure d'exécution quotidienne, format "HH:mm". Défaut "03:30" — creux
    d'activité, et suffisamment après minuit pour qu'une journée soit complète.

.PARAMETER Environment
    "prod" (défaut) ou "staging".

.PARAMETER Supprimer
    Retire la tâche au lieu de l'enregistrer.

.EXAMPLE
    .\scripts\register-backup-task.ps1

.EXAMPLE
    .\scripts\register-backup-task.ps1 -Heure "02:00"

.EXAMPLE
    .\scripts\register-backup-task.ps1 -Supprimer
#>

[CmdletBinding()]
param(
    [ValidatePattern('^\d{2}:\d{2}$')]
    [string]$Heure = "03:30",

    [ValidateSet("prod", "staging")]
    [string]$Environment = "prod",

    [switch]$Supprimer
)

$ErrorActionPreference = 'Stop'

$nomTache = "Piloti - sauvegarde $Environment"
$racine = if ($env:PILOTI_DEPLOY_ROOT) { $env:PILOTI_DEPLOY_ROOT } else { Join-Path $HOME "piloti-deploy" }
$envFile = Join-Path (Join-Path $racine $Environment) ".env.$(if ($Environment -eq 'prod') { 'production' } else { 'staging' })"
$backupScript = Join-Path $PSScriptRoot "backup.ps1"
$journal = Join-Path $HOME "piloti-backups\journal-$Environment.log"

if ($Supprimer) {
    if (Get-ScheduledTask -TaskName $nomTache -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nomTache -Confirm:$false
        Write-Host "Tache supprimee : $nomTache" -ForegroundColor Yellow
    } else {
        Write-Host "Aucune tache nommee '$nomTache'." -ForegroundColor Yellow
    }
    return
}

if (-not (Test-Path $envFile)) { throw "Fichier d'environnement introuvable : $envFile" }
if (-not (Test-Path $backupScript)) { throw "Script de sauvegarde introuvable : $backupScript" }

# La commande exécutée par la tâche. Elle relit le .env à CHAQUE exécution :
# une clé changée ou une destination modifiée est prise en compte sans qu'il
# faille réenregistrer la tâche.
$commande = @"
`$ErrorActionPreference = 'Stop'
`$horodatage = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
try {
    Get-Content '$envFile' | ForEach-Object {
        if (`$_ -match '^(BACKUP_AGE_RECIPIENT|PILOTI_BACKUP_DIR|PILOTI_BACKUP_REMOTE)=(.*)`$') {
            Set-Item -Path "Env:`$(`$Matches[1])" -Value (`$Matches[2].Trim('"'))
        }
    }
    & '$backupScript' -Environment $Environment
    Add-Content '$journal' "`$horodatage OK"
} catch {
    Add-Content '$journal' "`$horodatage ECHEC : `$(`$_.Exception.Message)"
    exit 1
}
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($commande))

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encoded"
$declencheur = New-ScheduledTaskTrigger -Daily -At $Heure
# `StartWhenAvailable` : si la machine dormait à l'heure dite, la sauvegarde se
# rattrape au réveil plutôt que d'être simplement sautée.
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $nomTache -Action $action -Trigger $declencheur `
    -Settings $reglages -Description "PROD-02 — sauvegarde chiffrée quotidienne de Piloti ($Environment)." `
    -Force | Out-Null

New-Item -ItemType Directory -Force -Path (Split-Path $journal -Parent) | Out-Null

Write-Host "Tache enregistree : $nomTache" -ForegroundColor Green
Write-Host "  quotidienne a $Heure, rattrapee au reveil si la machine dormait"
Write-Host "  environnement  : $envFile"
Write-Host "  journal        : $journal"
Write-Host ""
Write-Host "La tache tourne SANS la cle privee : elle ne verifie donc pas les archives." -ForegroundColor Yellow
Write-Host "Prevoir une verification periodique, cle montee le temps de l'operation :" -ForegroundColor Yellow
Write-Host "  `$env:BACKUP_AGE_IDENTITY = '<chemin de la cle>'"
Write-Host "  .\scripts\backup.ps1 -Environment $Environment -Verify"
