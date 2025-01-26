import { Context } from '@yaakapp/api';
import { AccessToken, AccessTokenRawResponse, getToken, storeToken } from '../store';

export function getImplicit(
  ctx: Context,
  contextId: string,
  {
    authorizationUrl: authorizationUrlRaw,
    responseType,
    clientId,
    redirectUri,
    scope,
    state,
  }: {
    authorizationUrl: string;
    responseType: string;
    clientId: string;
    redirectUri: string | null;
    scope: string | null;
    state: string | null;
  },
) :Promise<AccessToken> {
  return new Promise(async (resolve, reject) => {
    const token = await getToken(ctx, contextId);
    if (token) {
      // resolve(token.response.access_token);
      // TODO: Refresh token if expired
      // return;
    }

    const authorizationUrl = new URL(`${authorizationUrlRaw ?? ''}`);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    if (redirectUri) authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    if (scope) authorizationUrl.searchParams.set('scope', scope);
    if (state) authorizationUrl.searchParams.set('state', state);
    if (responseType.includes('id_token')) {
      authorizationUrl.searchParams.set('nonce', String(Math.floor(Math.random() * 9999999999999) + 1));
    }

    const authorizationUrlStr = authorizationUrl.toString();
    let { close } = await ctx.window.openUrl({
      url: authorizationUrlStr,
      label: 'oauth-authorization-url',
      async onNavigate({ url: urlStr }) {
        const url = new URL(urlStr);
        if (url.searchParams.has('error')) {
          return reject(Error(`Failed to authorize: ${url.searchParams.get('error')}`));
        }

        // Close the window here, because we don't need it anymore
        close();

        const hash = url.hash.slice(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        if (idToken) {
          params.set('access_token', idToken);
          params.delete('id_token');
        }
        const response = Object.fromEntries(params) as unknown as AccessTokenRawResponse;
        try {
          resolve(await storeToken(ctx, contextId, response));
        } catch (err) {
          reject(err);
        }
      },
    });
  });
}
