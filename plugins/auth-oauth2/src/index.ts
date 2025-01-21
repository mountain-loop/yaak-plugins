import { FormInputSelectOption, HttpRequest, PluginDefinition } from '@yaakapp/api';
import { readFileSync } from 'node:fs';

const grantTypes: FormInputSelectOption[] = [{
  name: 'Authorization Code',
  value: 'authorization_code',
}];

const defaultGrantType = grantTypes[0]!.value;

export const plugin: PluginDefinition = {
  authentication: {
    name: 'oauth2',
    label: 'OAuth 2',
    shortLabel: 'OAuth 2.0',
    config: [{
      type: 'select',
      name: 'grantType',
      label: 'Grant Type',
      defaultValue: defaultGrantType,
      options: grantTypes,
    }, {
      type: 'text',
      name: 'authorizationUrl',
      label: 'Authorization URL',
      optional: true,
    }, {
      type: 'text',
      name: 'accessTokenUrl',
      label: 'Access Token URL',
      optional: true,
    }, {
      type: 'text',
      name: 'clientId',
      label: 'Client ID',
      optional: true,
    }, {
      type: 'text',
      name: 'clientSecret',
      label: 'Client Secret',
      optional: true,
    }, {
      type: 'text',
      name: 'redirectUri',
      label: 'Redirect URI',
      optional: true,
    }, {
      type: 'text',
      name: 'scope',
      label: 'Scope',
      optional: true,
    }],
    async onApply(ctx, args) {
      console.log('PERFORMING OAUTH 2.0', args.config);
      return new Promise(async (resolve, reject) => {
        try {
          const authorizationUrl = new URL(`${args.config.authorizationUrl ?? ''}`);
          authorizationUrl.searchParams.set('client_id', `${args.config.clientId ?? ''}`);
          authorizationUrl.searchParams.set('redirect_uri', `${args.config.redirectUri ?? ''}`);
          authorizationUrl.searchParams.set('response_type', 'code');
          if (args.config.scope) {
            authorizationUrl.searchParams.set('scope', `${args.config.scope ?? ''}`);
          }
          const url = authorizationUrl.toString();
          console.log('Opening authorization url', url);
          let { close } = await ctx.window.openUrl({
            url,
            label: 'oauth2Thing',
            async onNavigate({ url: urlStr }) {
              const url = new URL(urlStr);
              const code = url.searchParams.get('code');
              if (!code) return;

              const req: Partial<HttpRequest> = {
                method: 'POST',
                url: `${args.config.accessTokenUrl}`,
                urlParameters: [
                  { name: 'client_id', value: `${args.config.clientId || ''}` },
                  { name: 'client_secret', value: `${args.config.clientSecret || ''}` },
                  { name: 'code', value: `${code || ''}` },
                  { name: 'redirect_uri', value: `${args.config.redirectUri || ''}` },
                ],
                headers: [
                  { name: 'Accept', value: 'application/json' },
                  { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
                ],
                workspaceId: 'wk_woHS9oiCdW',
              };


              const resp = await ctx.httpRequest.send({
                // @ts-ignore
                httpRequest: req,
              });

              const body = readFileSync(resp.bodyPath ?? '', 'utf8');
              if (resp.status < 200 || resp.status >= 300) {
                reject(new Error('Failed to fetch access token with status=' + resp.status));
              }

              const bodyObj = JSON.parse(body);
              const accessToken = bodyObj['access_token'];
              console.log('GOT ACCESS TOKEN', accessToken);
              resolve({ setHeaders: [{ name: 'Authorization', value: `Bearer ${accessToken}` }] });
              close();
            },
          });
        } catch (err) {
          console.log('ERR');
          reject(err);
        }
      });
    },
  },
};
