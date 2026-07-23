<#
.SYNOPSIS
    Déploie Piloti en pull-based, sans runner CI, pour l'environnement staging ou prod.

.DESCRIPTION
    Modèle pull-based (cf. docs/DEPLOYMENT.md et D-018 dans DECISIONS.md) : ce script
    tourne côté hôte — lancé à la main ou par une tâche planifiée Windows — jamais dans
    une CI GitHub Actions. Il se contente de récupérer le code DÉJÀ FUSIONNÉ sur `develop`
    (staging) ou `main` (prod), puis de relancer la stack Docker Compose correspondante.
    Le dépôt étant public, seul le propriétaire peut pousser sur ces deux branches : aucun
    code d'un fork ne peut donc atteindre ce script.

    Répertoire de déploiement : dédié par environnement, JAMAIS le répertoire de dev du
    propriétaire. Configurable via $env:PILOTI_DEPLOY_ROOT (défaut : "$HOME\piloti-deploy"),
    le script travaille exclusivement dans "<root>\<environment>" et n'exécute jamais de
    `git checkout`/`reset` ailleurs.

.PARAMETER Environment
    "staging" (branche develop) ou "prod" (branche main).

.EXAMPLE
    .\scripts\deploy.ps1 -Environment staging

.EXAMPLE
    $env:PILOTI_DEPLOY_ROOT = "D:\piloti-deploy"
    .\scripts\deploy.ps1 -Environment prod
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("staging", "prod")]
    [string]$Environment
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Configuration par environnement.
# ---------------------------------------------------------------------------
$repoUrl = if ($env:PILOTI_REPO_URL) { $env:PILOTI_REPO_URL } else { "https://github.com/mathiscapart/piloti.git" }
$deployRoot = if ($env:PILOTI_DEPLOY_ROOT) { $env:PILOTI_DEPLOY_ROOT } else { Join-Path $HOME "piloti-deploy" }
$deployDir = Join-Path $deployRoot $Environment

switch ($Environment) {
    "staging" {
        $branch = "develop"
        $composeFile = "docker-compose.staging.yml"
        $envFile = ".env.staging"
        # Doit rester "piloti-staging" : les labels Traefik de
        # docker-compose.staging.yml référencent en dur le réseau
        # "piloti-staging_internal" (= <project>_internal).
        $projectName = "piloti-staging"
    }
    "prod" {
        $branch = "main"
        $composeFile = "docker-compose.yml"
        $envFile = ".env.production"
        # Doit rester "piloti" : c'est le nom de projet Compose déjà utilisé par
        # la stack prod en place (labels Traefik "piloti_internal", volumes
        # nommés "piloti_piloti-data" / "piloti_piloti-uploads"). Un autre nom de
        # projet créerait une stack et des volumes distincts — la prod actuelle
        # ne serait plus mise à jour et une base vide serait créée à côté.
        $projectName = "piloti"
    }
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step "Déploiement Piloti — environnement : $Environment (branche $branch)"
Write-Host "Répertoire de déploiement : $deployDir"
Write-Host "Nom de projet Docker Compose : $projectName"

# ---------------------------------------------------------------------------
# 1. Répertoire de déploiement dédié — clone initial si absent. Ne touche
#    jamais le répertoire de dev du propriétaire (ni git, ni docker).
# ---------------------------------------------------------------------------
if (-not (Test-Path $deployDir)) {
    Write-Step "Répertoire de déploiement absent, clonage initial"
    New-Item -ItemType Directory -Path $deployRoot -Force | Out-Null
    git clone $repoUrl $deployDir
    if ($LASTEXITCODE -ne 0) { throw "Échec du clonage initial dans '$deployDir'." }
} elseif (-not (Test-Path (Join-Path $deployDir ".git"))) {
    throw "'$deployDir' existe mais n'est pas un dépôt git. Vérifier manuellement avant de relancer le script."
}

Push-Location $deployDir
try {
    # -------------------------------------------------------------------------
    # 2. Récupération du code déjà fusionné (jamais un checkout de branche
    #    arbitraire) — la sûreté du modèle pull-based repose entièrement sur
    #    cette étape : on ne déploie que ce qui a été fusionné sur develop/main.
    # -------------------------------------------------------------------------
    Write-Step "git fetch origin"
    git fetch origin
    if ($LASTEXITCODE -ne 0) { throw "Échec de 'git fetch origin' dans '$deployDir'." }

    Write-Step "git reset --hard origin/$branch"
    git reset --hard "origin/$branch"
    if ($LASTEXITCODE -ne 0) { throw "Échec de 'git reset --hard origin/$branch' dans '$deployDir'." }

    $currentCommit = (git rev-parse --short HEAD).Trim()
    Write-Host "Commit déployé : $currentCommit"

    # -------------------------------------------------------------------------
    # 3. Fichier d'environnement local — jamais commité, jamais dans ce script.
    # -------------------------------------------------------------------------
    $envFilePath = Join-Path $deployDir $envFile
    if (-not (Test-Path $envFilePath)) {
        throw "Fichier '$envFile' introuvable dans '$deployDir'. Le créer avant de déployer (cf. docs/DEPLOYMENT.md)."
    }

    # -------------------------------------------------------------------------
    # 4. Build + up -d, avec le fichier compose et le nom de projet de l'environnement.
    # -------------------------------------------------------------------------
    $env:COMPOSE_PROJECT_NAME = $projectName

    Write-Step "docker compose build ($composeFile)"
    docker compose -f $composeFile --env-file $envFile build
    if ($LASTEXITCODE -ne 0) { throw "Échec de 'docker compose build' pour l'environnement '$Environment'." }

    Write-Step "docker compose up -d ($composeFile)"
    docker compose -f $composeFile --env-file $envFile up -d
    if ($LASTEXITCODE -ne 0) { throw "Échec de 'docker compose up -d' pour l'environnement '$Environment'." }

    # -------------------------------------------------------------------------
    # 5. Nettoyage des images orphelines — évite l'accumulation à chaque déploiement.
    # -------------------------------------------------------------------------
    Write-Step "docker image prune -f"
    docker image prune -f
    if ($LASTEXITCODE -ne 0) { throw "Échec de 'docker image prune -f'." }

    Write-Step "Déploiement '$Environment' terminé avec succès (commit $currentCommit)."
}
finally {
    Pop-Location
}
