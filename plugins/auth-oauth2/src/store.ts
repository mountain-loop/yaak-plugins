import { Context } from '../../../../yaak/packages/plugin-runtime-types';

export async function storeToken(ctx: Context, requestId: string, response: AccessTokenRawResponse) {
  if (!response.access_token) {
    throw new Error(`Token not found in response`);
  }

  const expiresAt = response.expires_in ? Date.now() + response.expires_in * 1000 : null;
  const token: AccessToken = {
    response,
    expiresAt,
  };
  await ctx.store.set<AccessToken>(tokenStoreKey(requestId), token);
  return token;
}

export async function getToken(ctx: Context, requestId: string) {
  return ctx.store.get<AccessToken>(tokenStoreKey(requestId));
}

function tokenStoreKey(requestId: string) {
  return ['token', requestId].join('_');
}

export interface AccessToken {
  response: AccessTokenRawResponse,
  expiresAt: number | null;
}

export interface AccessTokenRawResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}
