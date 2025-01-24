import { Context } from '@yaakapp/api';
import { getAccessToken } from '../getAccessToken';
import { AccessToken, getToken, storeToken } from '../store';

export async function getResourceOwner(
  ctx: Context,
  requestId: string,
  {
    accessTokenUrl,
    clientId,
    clientSecret,
    username,
    password,
    credentialsInBody,
    scope,
  }: {
    accessTokenUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    scope: string | null;
    credentialsInBody: boolean;
  },
): Promise<AccessToken> {
  const token = await getToken(ctx, requestId);
  if (token) {
    // resolve(token.response.access_token);
    // TODO: Refresh token if expired
    // return;
  }

  const response = await getAccessToken(ctx, {
    accessTokenUrl,
    clientId,
    clientSecret,
    scope,
    grantType: 'password',
    credentialsInBody,
    params: [
      { name: 'username', value: username },
      { name: 'password', value: password },
    ],
  });

  return storeToken(ctx, requestId, response);
}
