import { APIError } from "better-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_RATE_LIMITS,
  RATE_LIMITED_CODE,
  authRateLimitPlan,
  classifyOutcome,
  clientIp,
  enforceAuthRateLimit,
  isLimiterRejection,
  normalizeEmail,
  rateLimitMessage,
  recordAuthOutcome,
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

describe("authRateLimitPlan", () => {
  const ip = "203.0.113.7";

  it("connexion : compte les échecs par email+IP et par IP, remet email+IP à zéro au succès", () => {
    expect(authRateLimitPlan("/sign-in/email", "Admin@Piloti.fr", ip)).toEqual({
      everyRequest: [],
      failures: [
        { limiter: "loginFailsByEmailAndIp", key: "admin@piloti.fr|203.0.113.7" },
        { limiter: "loginFailsByIp", key: ip },
      ],
      resetOnSuccess: [{ limiter: "loginFailsByEmailAndIp", key: "admin@piloti.fr|203.0.113.7" }],
    });
  });

  it("connexion sans email : seul le compteur par IP s'applique", () => {
    expect(authRateLimitPlan("/sign-in/email", null, ip)).toEqual({
      everyRequest: [],
      failures: [{ limiter: "loginFailsByIp", key: ip }],
      resetOnSuccess: [],
    });
  });

  it("mot de passe oublié : compte chaque demande par email ciblé et par IP", () => {
    expect(authRateLimitPlan("/request-password-reset", "a@b.fr", ip)).toEqual({
      everyRequest: [
        { limiter: "resetRequestsByEmail", key: "a@b.fr" },
        { limiter: "resetRequestsByIp", key: ip },
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
