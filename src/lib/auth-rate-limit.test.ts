import { APIError } from "better-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_RATE_LIMITS,
  RATE_LIMITED_CODE,
  authRateLimitPlan,
  classifyOutcome,
  clientIp,
  emailKey,
  enforceAuthRateLimit,
  enforcePasswordChangeLimit,
  isLimiterRejection,
  normalizeEmail,
  rateLimitMessage,
  recordAuthOutcome,
  recordPasswordChangeOutcome,
} from "./auth-rate-limit";

// Les compteurs sont des singletons de module : chaque test prend une IP et un
// email qui lui sont propres, pour ne pas hériter des tentatives d'un autre.
let seq = 0;
function fresh() {
  seq += 1;
  return {
    email: `user${seq}@piloti.fr`,
    headers: new Headers({ "cf-connecting-ip": `198.51.100.${seq}` }),
  };
}

const failure = new APIError("UNAUTHORIZED", { message: "Invalid email or password" });

async function failSignIn(email: string, headers: Headers, times: number) {
  for (let i = 0; i < times; i++) {
    await enforceAuthRateLimit("/sign-in/email", { email }, headers);
    await recordAuthOutcome("/sign-in/email", { email }, headers, failure);
  }
}

async function expectRateLimited(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(APIError);
  expect((err as APIError).statusCode).toBe(429);
  expect((err as APIError).body?.code).toBe(RATE_LIMITED_CODE);
  return err as APIError;
}

describe("clientIp", () => {
  it("lit Cf-Connecting-Ip", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
  });

  it("ignore X-Forwarded-For, réécrit par Traefik avec l'IP de cloudflared", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "172.19.0.4" }))).toBe("unknown");
  });

  it("renvoie « unknown » sans en-têtes", () => {
    expect(clientIp(undefined)).toBe("unknown");
  });
});

describe("normalizeEmail", () => {
  it("met en minuscules et retire les espaces", () => {
    expect(normalizeEmail("  Admin@Piloti.FR ")).toBe("admin@piloti.fr");
  });

  it("renvoie null si l'email est absent ou n'est pas une chaîne", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail("  ")).toBeNull();
  });
});

describe("emailKey", () => {
  it("ne dépend ni de la casse ni des espaces", () => {
    expect(emailKey(" Admin@Piloti.FR ")).toBe(emailKey("admin@piloti.fr"));
  });

  it("distingue deux adresses qui ne diffèrent qu'au-delà de 254 caractères", () => {
    const prefix = "a".repeat(260);
    expect(emailKey(`${prefix}1@x.fr`)).not.toBe(emailKey(`${prefix}2@x.fr`));
  });
});

describe("authRateLimitPlan", () => {
  const ip = "203.0.113.7";

  it("connexion : compte les échecs par IP puis par email+IP, remet email+IP à zéro au succès", () => {
    const byEmailAndIp = `${emailKey("admin@piloti.fr")}|203.0.113.7`;
    expect(authRateLimitPlan("/sign-in/email", "Admin@Piloti.fr", ip)).toEqual({
      everyRequest: [],
      failures: [
        { limiter: "loginFailsByIp", key: ip },
        { limiter: "loginFailsByEmailAndIp", key: byEmailAndIp },
      ],
      resetOnSuccess: [{ limiter: "loginFailsByEmailAndIp", key: byEmailAndIp }],
    });
  });

  it("connexion sans email : seul le compteur par IP s'applique", () => {
    expect(authRateLimitPlan("/sign-in/email", null, ip)).toEqual({
      everyRequest: [],
      failures: [{ limiter: "loginFailsByIp", key: ip }],
      resetOnSuccess: [],
    });
  });

  it("mot de passe oublié : compte chaque demande par IP puis par email ciblé", () => {
    expect(authRateLimitPlan("/request-password-reset", "a@b.fr", ip)).toEqual({
      everyRequest: [
        { limiter: "resetRequestsByIp", key: ip },
        { limiter: "resetRequestsByEmail", key: emailKey("a@b.fr") },
      ],
      failures: [],
      resetOnSuccess: [],
    });
  });

  it("inscription : compte chaque demande par IP", () => {
    expect(authRateLimitPlan("/sign-up/email", "a@b.fr", ip)).toEqual({
      everyRequest: [{ limiter: "signUpsByIp", key: ip }],
      failures: [],
      resetOnSuccess: [],
    });
  });

  it("réinitialisation : compte chaque demande par IP", () => {
    expect(authRateLimitPlan("/reset-password", null, ip)).toEqual({
      everyRequest: [{ limiter: "passwordResetsByIp", key: ip }],
      failures: [],
      resetOnSuccess: [],
    });
  });

  it("email très long : la clé garde une longueur bornée", () => {
    const huge = `${"a".repeat(100_000)}@piloti.fr`;
    const plan = authRateLimitPlan("/request-password-reset", huge, ip);
    const key = plan?.everyRequest.find((c) => c.limiter === "resetRequestsByEmail")?.key;
    expect(key).toBe(emailKey(huge));
    expect(key!.length).toBeLessThanOrEqual(64);
  });

  it("changement de mot de passe : limité par sa propre fonction, pas par les hooks", () => {
    expect(authRateLimitPlan("/change-password", null, ip)).toBeNull();
  });

  it("les autres routes ne sont pas concernées", () => {
    expect(authRateLimitPlan("/get-session", "a@b.fr", ip)).toBeNull();
    expect(authRateLimitPlan("/reset-password/:token", null, ip)).toBeNull();
  });
});

describe("classifyOutcome", () => {
  it("401 = échec d'identifiants", () => {
    expect(classifyOutcome(failure)).toBe("failure");
  });

  it("autre APIError (compte non actif…) : ni échec ni succès", () => {
    expect(classifyOutcome(new APIError("FORBIDDEN", { message: "x" }))).toBe("other");
  });

  it("pas d'erreur = succès", () => {
    expect(classifyOutcome({ user: { id: "u1" } })).toBe("success");
  });
});

describe("connexion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bloque la tentative qui suit le 5e échec, avec un message en français", async () => {
    const { email, headers } = fresh();
    await failSignIn(email, headers, AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points);
    const err = await expectRateLimited(enforceAuthRateLimit("/sign-in/email", { email }, headers));
    expect(err.message).toMatch(/^Trop de tentatives\. Réessayez dans \d+ minutes?\.$/);
  });

  it("ne bloque pas le même compte depuis une autre IP", async () => {
    const { email, headers } = fresh();
    await failSignIn(email, headers, AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points);
    const other = fresh().headers;
    await expect(enforceAuthRateLimit("/sign-in/email", { email }, other)).resolves.toBeUndefined();
  });

  it("une connexion réussie remet à zéro les échecs consécutifs", async () => {
    const { email, headers } = fresh();
    await failSignIn(email, headers, 4);
    await recordAuthOutcome("/sign-in/email", { email }, headers, { user: {} });
    await failSignIn(email, headers, 4);
    await expect(enforceAuthRateLimit("/sign-in/email", { email }, headers)).resolves.toBeUndefined();
  });

  it("le blocage expire avec la fenêtre : aucun verrouillage définitif", async () => {
    vi.useFakeTimers();
    const { email, headers } = fresh();
    await failSignIn(email, headers, AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points);
    await expectRateLimited(enforceAuthRateLimit("/sign-in/email", { email }, headers));
    vi.advanceTimersByTime(AUTH_RATE_LIMITS.loginFailsByEmailAndIp.duration * 1000 + 1000);
    await expect(enforceAuthRateLimit("/sign-in/email", { email }, headers)).resolves.toBeUndefined();
  });

  it("des tentatives simultanées ne dépassent pas le seuil", async () => {
    // Le mot de passe est vérifié de façon asynchrone (scrypt) : sans
    // consommation avant l'endpoint, N requêtes parallèles passeraient toutes.
    const { email, headers } = fresh();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => enforceAuthRateLimit("/sign-in/email", { email }, headers)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points,
    );
  });

  it("les connexions réussies ne comptent pas dans le seuil par IP", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailsByIp.points + 5; i++) {
      const email = `ok${seq}-${i}@piloti.fr`;
      await enforceAuthRateLimit("/sign-in/email", { email }, headers);
      await recordAuthOutcome("/sign-in/email", { email }, headers, { user: {} });
    }
    await expect(
      enforceAuthRateLimit("/sign-in/email", { email: `encore${seq}@piloti.fr` }, headers),
    ).resolves.toBeUndefined();
  });

  it("un compte bloqué qui insiste n'entame pas le compteur par IP", async () => {
    const { email, headers } = fresh();
    await failSignIn(email, headers, AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points);
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailsByIp.points; i++) {
      await expectRateLimited(enforceAuthRateLimit("/sign-in/email", { email }, headers));
    }
    // L'IP (wifi partagé) garde son quota : 5 échecs pris, 25 encore disponibles.
    await expect(
      enforceAuthRateLimit("/sign-in/email", { email: `voisin${seq}@piloti.fr` }, headers),
    ).resolves.toBeUndefined();
  });

  it("bloque une IP qui essaie beaucoup de comptes différents", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailsByIp.points; i++) {
      await failSignIn(`spray${seq}-${i}@piloti.fr`, headers, 1);
    }
    await expectRateLimited(
      enforceAuthRateLimit("/sign-in/email", { email: `nouveau${seq}@piloti.fr` }, headers),
    );
  });
});

describe("mot de passe oublié", () => {
  it("limite les demandes par email ciblé, quelle que soit l'IP", async () => {
    const { email } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.resetRequestsByEmail.points; i++) {
      await enforceAuthRateLimit("/request-password-reset", { email }, fresh().headers);
    }
    await expectRateLimited(
      enforceAuthRateLimit("/request-password-reset", { email: email.toUpperCase() }, fresh().headers),
    );
  });

  it("limite aussi une IP qui vise beaucoup d'adresses différentes", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.resetRequestsByIp.points; i++) {
      await enforceAuthRateLimit("/request-password-reset", { email: `cible${seq}-${i}@piloti.fr` }, headers);
    }
    await expectRateLimited(
      enforceAuthRateLimit("/request-password-reset", { email: `autre${seq}@piloti.fr` }, headers),
    );
  });

  it("une IP bloquée n'entame plus le quota de l'adresse visée", async () => {
    const { email, headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.resetRequestsByIp.points; i++) {
      await enforceAuthRateLimit("/request-password-reset", { email: `leurre${seq}-${i}@piloti.fr` }, headers);
    }
    for (let i = 0; i < 5; i++) {
      await expectRateLimited(enforceAuthRateLimit("/request-password-reset", { email }, headers));
    }
    // Le quota de l'adresse est intact : ses 3 demandes passent depuis d'autres IP.
    for (let i = 0; i < AUTH_RATE_LIMITS.resetRequestsByEmail.points; i++) {
      await expect(
        enforceAuthRateLimit("/request-password-reset", { email }, fresh().headers),
      ).resolves.toBeUndefined();
    }
  });

  it("n'affecte pas les autres adresses", async () => {
    const { email, headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.resetRequestsByEmail.points; i++) {
      await enforceAuthRateLimit("/request-password-reset", { email }, headers);
    }
    await expect(
      enforceAuthRateLimit("/request-password-reset", { email: fresh().email }, headers),
    ).resolves.toBeUndefined();
  });
});

describe("changement de mot de passe", () => {
  let userSeq = 0;
  const freshUser = () => `user-${++userSeq}`;

  async function failChange(userId: string, headers: Headers, times: number) {
    for (let i = 0; i < times; i++) {
      await enforcePasswordChangeLimit(userId, headers);
      await recordPasswordChangeOutcome(userId, headers, "failure");
    }
  }

  it("bloque la tentative qui suit le 5e mot de passe actuel erroné", async () => {
    const userId = freshUser();
    const { headers } = fresh();
    await failChange(userId, headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points);
    const err = await expectRateLimited(enforcePasswordChangeLimit(userId, headers));
    expect(err.message).toMatch(/^Trop de tentatives\. Réessayez dans \d+ minutes?\.$/);
  });

  it("le blocage suit le compte, même depuis une autre IP", async () => {
    const userId = freshUser();
    await failChange(userId, fresh().headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points);
    await expectRateLimited(enforcePasswordChangeLimit(userId, fresh().headers));
  });

  it("un changement réussi remet à zéro les échecs du compte", async () => {
    const userId = freshUser();
    const { headers } = fresh();
    await failChange(userId, headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points - 1);
    await enforcePasswordChangeLimit(userId, headers);
    await recordPasswordChangeOutcome(userId, headers, "success");
    await failChange(userId, headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points - 1);
    await expect(enforcePasswordChangeLimit(userId, headers)).resolves.toBeUndefined();
  });

  it("une erreur autre qu'un mot de passe faux rend le point", async () => {
    const userId = freshUser();
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.passwordChangeFailsByUser.points + 2; i++) {
      await enforcePasswordChangeLimit(userId, headers);
      await recordPasswordChangeOutcome(userId, headers, "other");
    }
    await expect(enforcePasswordChangeLimit(userId, headers)).resolves.toBeUndefined();
  });

  it("des tentatives simultanées ne dépassent pas le seuil", async () => {
    const userId = freshUser();
    const { headers } = fresh();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => enforcePasswordChangeLimit(userId, headers)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      AUTH_RATE_LIMITS.passwordChangeFailsByUser.points,
    );
  });

  it("bloque une IP qui essaie sur beaucoup de comptes (sessions volées)", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.passwordChangeFailsByIp.points; i++) {
      await failChange(freshUser(), headers, 1);
    }
    const target = freshUser();
    await expectRateLimited(enforcePasswordChangeLimit(target, headers));
    // Refus par IP avant tout : le compteur du compte visé n'a pas été entamé.
    await failChange(target, fresh().headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points - 1);
    await expect(enforcePasswordChangeLimit(target, fresh().headers)).resolves.toBeUndefined();
  });

  it("un compte bloqué qui insiste n'entame pas le compteur par IP", async () => {
    const userId = freshUser();
    const { headers } = fresh();
    await failChange(userId, headers, AUTH_RATE_LIMITS.passwordChangeFailsByUser.points);
    for (let i = 0; i < AUTH_RATE_LIMITS.passwordChangeFailsByIp.points; i++) {
      await expectRateLimited(enforcePasswordChangeLimit(userId, headers));
    }
    await expect(enforcePasswordChangeLimit(freshUser(), headers)).resolves.toBeUndefined();
  });

  it("sans Cf-Connecting-Ip (dev), le compteur par compte s'applique quand même", async () => {
    const userId = freshUser();
    await failChange(userId, new Headers(), AUTH_RATE_LIMITS.passwordChangeFailsByUser.points);
    await expectRateLimited(enforcePasswordChangeLimit(userId, new Headers()));
  });

  describe("au seuil : déconnexion de la session et alerte au titulaire", () => {
    async function failOnce(userId: string, headers: Headers) {
      await enforcePasswordChangeLimit(userId, headers);
      return recordPasswordChangeOutcome(userId, headers, "failure");
    }

    it("signale le blocage à l'échec qui atteint le seuil, pas avant", async () => {
      const userId = freshUser();
      const { headers } = fresh();
      const results = [];
      for (let i = 0; i < AUTH_RATE_LIMITS.passwordChangeFailsByUser.points; i++) {
        results.push(await failOnce(userId, headers));
      }
      expect(results.slice(0, -1).every((r) => !r.locked && !r.alertOwner)).toBe(true);
      expect(results.at(-1)).toEqual({ locked: true, alertOwner: true });
    });

    it("succès et erreur autre ne bloquent rien", async () => {
      const userId = freshUser();
      const { headers } = fresh();
      await enforcePasswordChangeLimit(userId, headers);
      expect(await recordPasswordChangeOutcome(userId, headers, "success")).toEqual({
        locked: false,
        alertOwner: false,
      });
      await enforcePasswordChangeLimit(userId, headers);
      expect(await recordPasswordChangeOutcome(userId, headers, "other")).toEqual({
        locked: false,
        alertOwner: false,
      });
    });

    it("chaque session qui atteint le seuil est déconnectée, une seule alerte par heure", async () => {
      vi.useFakeTimers();
      try {
        const userId = freshUser();
        const block = async () => {
          let last = { locked: false, alertOwner: false };
          for (let i = 0; i < AUTH_RATE_LIMITS.passwordChangeFailsByUser.points; i++) {
            last = await failOnce(userId, fresh().headers);
          }
          return last;
        };
        expect(await block()).toEqual({ locked: true, alertOwner: true });
        // Fenêtre du compte expirée, mais pas celle de l'alerte : une autre
        // session volée qui recommence est déconnectée, sans second email.
        vi.advanceTimersByTime(AUTH_RATE_LIMITS.passwordChangeFailsByUser.duration * 1000 + 1000);
        expect(await block()).toEqual({ locked: true, alertOwner: false });
      } finally {
        vi.useRealTimers();
      }
    });

    it("des échecs simultanés au seuil déconnectent chacun leur session, une seule alerte", async () => {
      const userId = freshUser();
      const { headers } = fresh();
      const points = AUTH_RATE_LIMITS.passwordChangeFailsByUser.points;
      for (let i = 0; i < points - 2; i++) await failOnce(userId, headers);
      await enforcePasswordChangeLimit(userId, headers);
      await enforcePasswordChangeLimit(userId, headers);
      const results = await Promise.all([
        recordPasswordChangeOutcome(userId, headers, "failure"),
        recordPasswordChangeOutcome(userId, headers, "failure"),
      ]);
      expect(results.every((r) => r.locked)).toBe(true);
      expect(results.filter((r) => r.alertOwner)).toHaveLength(1);
    });
  });

  describe("échecs dosés sous le seuil : alerte sur 24 h", () => {
    const perWindow = AUTH_RATE_LIMITS.passwordChangeFailsByUser.points - 1;
    const daily = AUTH_RATE_LIMITS.passwordChangeFailsByUserDaily.points;
    const windowMs = AUTH_RATE_LIMITS.passwordChangeFailsByUser.duration * 1000 + 1000;

    afterEach(() => {
      vi.useRealTimers();
    });

    // Un attaquant patient : 4 échecs, puis il attend la fin de la fenêtre.
    async function slowFailures(userId: string, count: number) {
      const results = [];
      for (let i = 0; i < count; i++) {
        if (i > 0 && i % perWindow === 0) vi.advanceTimersByTime(windowMs);
        await enforcePasswordChangeLimit(userId, fresh().headers);
        results.push(await recordPasswordChangeOutcome(userId, fresh().headers, "failure"));
      }
      return results;
    }

    it("prévient le titulaire au 10e échec de la journée, sans fermer la session", async () => {
      vi.useFakeTimers();
      const results = await slowFailures(freshUser(), daily);
      expect(results.slice(0, -1).every((r) => !r.locked && !r.alertOwner)).toBe(true);
      expect(results.at(-1)).toEqual({ locked: false, alertOwner: true });
    });

    it("une seule alerte par 24 h si l'attaquant continue au même rythme", async () => {
      vi.useFakeTimers();
      const results = await slowFailures(freshUser(), daily * 3);
      expect(results.filter((r) => r.alertOwner)).toHaveLength(1);
      expect(results.some((r) => r.locked)).toBe(false);
    });

    it("un changement réussi remet aussi le compteur de la journée à zéro", async () => {
      vi.useFakeTimers();
      const userId = freshUser();
      await slowFailures(userId, daily - 1);
      await enforcePasswordChangeLimit(userId, fresh().headers);
      await recordPasswordChangeOutcome(userId, fresh().headers, "success");
      vi.advanceTimersByTime(windowMs);
      const results = await slowFailures(userId, daily - 1);
      expect(results.some((r) => r.alertOwner)).toBe(false);
    });

    it("une erreur autre qu'un mot de passe faux ne compte pas", async () => {
      vi.useFakeTimers();
      const userId = freshUser();
      const { headers } = fresh();
      for (let i = 0; i < daily + 2; i++) {
        await enforcePasswordChangeLimit(userId, headers);
        await recordPasswordChangeOutcome(userId, headers, "other");
      }
      // Si « other » comptait, le 1er échec réel serait déjà au-delà du seuil.
      const results = await slowFailures(userId, daily - 1);
      expect(results.some((r) => r.alertOwner)).toBe(false);
    });

    it("pas de seconde alerte avant 24 h, une nouvelle après", async () => {
      vi.useFakeTimers();
      const userId = freshUser();
      await slowFailures(userId, daily);
      // Juste avant la fin des 24 h de l'alerte : l'attaquant continue.
      vi.advanceTimersByTime(AUTH_RATE_LIMITS.passwordChangeSlowAlertsByUser.duration * 1000 - 2 * windowMs);
      const late = await slowFailures(userId, perWindow);
      expect(late.some((r) => r.alertOwner)).toBe(false);
      // Toutes les fenêtres (24 h) expirées : un nouveau cycle de 10 échecs alerte.
      vi.advanceTimersByTime(AUTH_RATE_LIMITS.passwordChangeFailsByUserDaily.duration * 1000);
      const next = await slowFailures(userId, daily);
      expect(next.at(-1)).toEqual({ locked: false, alertOwner: true });
    });
  });
});

describe("inscription et réinitialisation", () => {
  it("limite les inscriptions par IP", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.signUpsByIp.points; i++) {
      await enforceAuthRateLimit("/sign-up/email", { email: `n${i}@piloti.fr` }, headers);
    }
    await expectRateLimited(enforceAuthRateLimit("/sign-up/email", { email: "x@piloti.fr" }, headers));
  });

  it("limite les réinitialisations par IP", async () => {
    const { headers } = fresh();
    for (let i = 0; i < AUTH_RATE_LIMITS.passwordResetsByIp.points; i++) {
      await enforceAuthRateLimit("/reset-password", { token: "t" }, headers);
    }
    await expectRateLimited(enforceAuthRateLimit("/reset-password", { token: "t" }, headers));
  });
});

describe("rateLimitMessage", () => {
  it("renvoie le message d'une APIError de dépassement", () => {
    const e = new APIError("TOO_MANY_REQUESTS", { code: RATE_LIMITED_CODE, message: "Trop de tentatives." });
    expect(rateLimitMessage(e)).toBe("Trop de tentatives.");
  });

  it("renvoie null pour toute autre erreur", () => {
    expect(rateLimitMessage(failure)).toBeNull();
    expect(rateLimitMessage(new Error("x"))).toBeNull();
  });
});

describe("isLimiterRejection", () => {
  // Next charge ce module dans plusieurs bundles (RSC, actions) : les limiteurs
  // partagés via globalThis peuvent rejeter avec le RateLimiterRes d'une autre
  // copie de la librairie. `instanceof RateLimiterRes` échoue alors.
  it("reconnaît un rejet venant d'une autre copie de la librairie", () => {
    expect(isLimiterRejection({ msBeforeNext: 1000, consumedPoints: 11, remainingPoints: 0 })).toBe(true);
  });

  it("ne confond pas une vraie erreur avec un rejet", () => {
    expect(isLimiterRejection(new Error("boom"))).toBe(false);
    expect(isLimiterRejection(null)).toBe(false);
  });
});

describe("alerte au titulaire du compte", () => {
  async function failOnce(email: string, headers: Headers) {
    await enforceAuthRateLimit("/sign-in/email", { email }, headers);
    return recordAuthOutcome("/sign-in/email", { email }, headers, failure);
  }

  it("désigne le compte à prévenir quand l'échec atteint le seuil de blocage, pas avant", async () => {
    const { email, headers } = fresh();
    const alerts: (string | null)[] = [];
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points; i++) {
      alerts.push(await failOnce(email.toUpperCase(), headers));
    }
    expect(alerts.slice(0, -1).every((a) => a === null)).toBe(true);
    expect(alerts.at(-1)).toBe(email);
  });

  it("une seule alerte par compte et par heure, même depuis d'autres IP", async () => {
    const { email } = fresh();
    const blockFrom = async (headers: Headers) => {
      let last: string | null = null;
      for (let i = 0; i < AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points; i++) {
        last = await failOnce(email, headers);
      }
      return last;
    };
    expect(await blockFrom(fresh().headers)).toBe(email);
    expect(await blockFrom(fresh().headers)).toBeNull();
  });

  it("aucune alerte pour un succès ni pour les autres routes", async () => {
    const { email, headers } = fresh();
    expect(await recordAuthOutcome("/sign-in/email", { email }, headers, { user: {} })).toBeNull();
    expect(await recordAuthOutcome("/sign-up/email", { email }, headers, failure)).toBeNull();
  });
});
