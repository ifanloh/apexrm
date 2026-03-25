import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { authRoleSchema, type AuthRole } from "./contracts.js";
import { config } from "./config.js";

const issuer = `${config.supabaseUrl}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const jwtKey = config.supabaseJwtSecret ? new TextEncoder().encode(config.supabaseJwtSecret) : null;

export type AuthUser = {
  userId: string;
  email: string | null;
  role: AuthRole;
  crewCode: string | null;
  displayName: string | null;
};

type JwtPayload = {
  sub?: string;
  email?: string;
  phone?: string;
  role?: string;
  app_metadata?: {
    role?: string;
    crew_code?: string;
  };
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

type SupabaseUserResponse = {
  id: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  app_metadata?: {
    role?: string;
    crew_code?: string;
  };
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

const eventQuerySchema = z.object({
  access_token: z.string().optional()
});

function resolveRole(rawRole: string | undefined): AuthRole {
  return authRoleSchema.catch("crew").parse(rawRole ?? "crew");
}

function getRequestToken(request: FastifyRequest) {
  const header = request.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  const query = eventQuerySchema.safeParse(request.query);
  return query.success ? query.data.access_token ?? null : null;
}

function toAuthUser(claims: JwtPayload): AuthUser {
  if (!claims.sub) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    role: resolveRole(claims.app_metadata?.role ?? claims.role),
    crewCode: claims.app_metadata?.crew_code ?? null,
    displayName: claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? claims.email ?? null
  };
}

async function verifyWithJwks(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, jwks, { issuer });
  return toAuthUser(payload as JwtPayload);
}

async function verifyWithSharedSecret(token: string): Promise<AuthUser> {
  if (!jwtKey) {
    throw new Error("Shared secret verification is not configured");
  }

  const { payload } = await jwtVerify(token, jwtKey, { issuer });
  return toAuthUser(payload as JwtPayload);
}

async function verifyWithAuthServer(token: string): Promise<AuthUser> {
  const response = await fetch(`${issuer}/user`, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Invalid or expired token");
  }

  const user = (await response.json()) as SupabaseUserResponse;

  return {
    userId: user.id,
    email: user.email ?? user.phone ?? null,
    role: resolveRole(user.app_metadata?.role ?? user.role),
    crewCode: user.app_metadata?.crew_code ?? null,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? user.phone ?? null
  };
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser> {
  const token = getRequestToken(request);

  if (!token) {
    throw new Error("Missing bearer token");
  }

  try {
    return await verifyWithJwks(token);
  } catch {
    if (jwtKey) {
      try {
        return await verifyWithSharedSecret(token);
      } catch {
        return verifyWithAuthServer(token);
      }
    }

    return verifyWithAuthServer(token);
  }
}

export function requireRole(actor: AuthUser, allowedRoles: AuthRole[]) {
  if (!allowedRoles.includes(actor.role)) {
    throw new Error("Forbidden");
  }
}
