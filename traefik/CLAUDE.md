Reverse proxy interne : Internet → Cloudflare → cloudflared → Traefik → app. Aucun port hôte, pas de dashboard.

- Toute ressource externe (tuiles de carte, CDN, police, iframe) doit être ajoutée à la CSP de `config/middlewares.yml`, sinon elle ne casse qu'en prod.
- Élargir la CSP au strict domaine nécessaire ; ne pas ajouter `unsafe-eval` ni de wildcard large.
- Les modifs de `config/` sont rechargées à chaud (`providers.file.watch`) ; les labels dans `docker-compose.yml` exigent un recreate du conteneur.
- Le compose dev neutralise ces labels (`!reset null`) : les réintroduire ferait entrer le dev en conflit avec le routeur prod (même Host).
