import {
  Context,
  FormInputSelectOption,
  GetHttpAuthenticationConfigRequest,
  JsonPrimitive,
  PluginDefinition,
} from '@yaakapp/api';
import { DEFAULT_PKCE_METHOD, getAuthorizationCode, PKCE_PLAIN, PKCE_SHA256 } from './grants/authorizationCode';
import { getClientCredentials } from './grants/clientCredentials';
import { getImplicit } from './grants/implicit';
import { getPassword } from './grants/password';
import { AccessToken, deleteToken, getToken } from './store';

type GrantType = 'authorization_code' | 'implicit' | 'password' | 'client_credentials';

const grantTypes: FormInputSelectOption[] = [
  { label: 'Authorization Code', value: 'authorization_code' },
  { label: 'Implicit', value: 'implicit' },
  { label: 'Resource Owner Password Credential', value: 'password' },
  { label: 'Client Credentials', value: 'client_credentials' },
];

const defaultGrantType = grantTypes[0]!.value;

function hiddenIfNot(grantTypes: GrantType[], ...other: ((values: GetHttpAuthenticationConfigRequest['values']) => boolean)[]) {
  return (_ctx: Context, { values }: GetHttpAuthenticationConfigRequest) => {
    const hasGrantType = grantTypes.find(t => t === String(values.grantType ?? defaultGrantType));
    const hasOtherBools = other.every(t => t(values));
    const show = hasGrantType && hasOtherBools;
    return { hidden: !show };
  };
}

const authorizationUrls = [
  'https://github.com/login/oauth/authorize',
  'https://account.box.com/api/oauth2/authorize',
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://api.imgur.com/oauth2/authorize',
  'https://bitly.com/oauth/authorize',
  'https://gitlab.example.com/oauth/authorize',
  'https://medium.com/m/oauth/authorize',
  'https://public-api.wordpress.com/oauth2/authorize',
  'https://slack.com/oauth/authorize',
  'https://todoist.com/oauth/authorize',
  'https://www.dropbox.com/oauth2/authorize',
  'https://www.linkedin.com/oauth/v2/authorization',
  'https://MY_SHOP.myshopify.com/admin/oauth/access_token',
];

const accessTokenUrls = [
  'https://github.com/login/oauth/access_token',
  'https://api-ssl.bitly.com/oauth/access_token',
  'https://api.box.com/oauth2/token',
  'https://api.dropboxapi.com/oauth2/token',
  'https://api.imgur.com/oauth2/token',
  'https://api.medium.com/v1/tokens',
  'https://gitlab.example.com/oauth/token',
  'https://public-api.wordpress.com/oauth2/token',
  'https://slack.com/api/oauth.access',
  'https://todoist.com/oauth/access_token',
  'https://www.googleapis.com/oauth2/v4/token',
  'https://www.linkedin.com/oauth/v2/accessToken',
  'https://MY_SHOP.myshopify.com/admin/oauth/authorize',
];

export const plugin: PluginDefinition = {
  authentication: {
    name: 'oauth2',
    label: 'OAuth 2.0',
    shortLabel: 'OAuth 2',
    actions: [
      {
        label: 'Copy Current Token',
        icon: 'copy',
        async onSelect(ctx, { contextId }) {
          const token = await getToken(ctx, contextId);
          if (token == null) {
            await ctx.toast.show({ message: 'No token to copy', color: 'warning' });
          } else {
            await ctx.clipboard.copyText(token.response.access_token);
            await ctx.toast.show({ message: 'Token copied to clipboard', icon: 'copy', color: 'success' });
          }
        },
      },
      {
        label: 'Delete Token',
        icon: 'trash',
        async onSelect(ctx, { contextId }) {
          if (await deleteToken(ctx, contextId)) {
            await ctx.toast.show({ message: 'Token deleted', color: 'success' });
          } else {
            await ctx.toast.show({ message: 'No token to delete', color: 'warning' });
          }
        },
      },
    ],
    args: [
      {
        type: 'select',
        name: 'grantType',
        label: 'Grant Type',
        hideLabel: true,
        defaultValue: defaultGrantType,
        options: grantTypes,
      },
      // Always-present fields
      { type: 'text', name: 'clientId', label: 'Client ID' },

      {
        type: 'text',
        name: 'clientSecret',
        label: 'Client Secret',
        password: true,
        dynamic: hiddenIfNot(['authorization_code', 'password', 'client_credentials']),
      },
      {
        type: 'text',
        name: 'authorizationUrl',
        label: 'Authorization URL',
        dynamic: hiddenIfNot(['authorization_code', 'implicit']),
        placeholder: authorizationUrls[0],
        completionOptions: authorizationUrls.map(url => ({ label: url, value: url })),
      },
      {
        type: 'text',
        name: 'accessTokenUrl',
        label: 'Access Token URL',
        placeholder: accessTokenUrls[0],
        dynamic: hiddenIfNot(['authorization_code', 'password', 'client_credentials']),
        completionOptions: accessTokenUrls.map(url => ({ label: url, value: url })),
      },
      {
        type: 'text',
        name: 'redirectUri',
        label: 'Redirect URI',
        optional: true,
        dynamic: hiddenIfNot(['authorization_code', 'implicit']),
      },
      {
        type: 'text',
        name: 'state',
        label: 'State',
        optional: true,
        dynamic: hiddenIfNot(['authorization_code', 'implicit']),
      },
      {
        type: 'checkbox',
        name: 'usePkce',
        label: 'Use PKCE',
        dynamic: hiddenIfNot(['authorization_code']),
      },
      {
        type: 'select',
        name: 'pkceChallengeMethod',
        label: 'Code Challenge Method',
        options: [{ label: 'SHA-256', value: PKCE_SHA256 }, { label: 'Plain', value: PKCE_PLAIN }],
        defaultValue: DEFAULT_PKCE_METHOD,
        dynamic: hiddenIfNot(['authorization_code'], ({ usePkce }) => !!usePkce),
      },
      {
        type: 'text',
        name: 'pkceCodeVerifier',
        label: 'Code Verifier',
        placeholder: 'Automatically generated if not provided',
        optional: true,
        dynamic: hiddenIfNot(['authorization_code'], ({ usePkce }) => !!usePkce),
      },
      {
        type: 'text',
        name: 'username',
        label: 'Username',
        optional: true,
        dynamic: hiddenIfNot(['password']),
      },
      {
        type: 'text',
        name: 'password',
        label: 'Password',
        password: true,
        optional: true,
        dynamic: hiddenIfNot(['password']),
      },
      {
        type: 'select',
        name: 'responseType',
        label: 'Response Type',
        defaultValue: 'token',
        options: [
          { label: 'Access Token', value: 'token' },
          { label: 'ID Token', value: 'id_token' },
          { label: 'ID and Access Token', value: 'id_token token' },
        ],
        dynamic: hiddenIfNot(['implicit']),
      },
      {
        type: 'accordion',
        label: 'Advanced',
        inputs: [
          { type: 'text', name: 'scope', label: 'Scope', optional: true },
          { type: 'text', name: 'headerPrefix', label: 'Header Prefix', optional: true, defaultValue: 'Bearer' },
          {
            type: 'select', name: 'credentials', label: 'Send Credentials', defaultValue: 'body', options: [
              { label: 'In Request Body', value: 'body' },
              { label: 'As Basic Authentication', value: 'basic' },
            ],
          },
        ],
      },
      {
        type: 'accordion',
        label: 'Access Token Response',
        async dynamic(ctx, { contextId }) {
          const token = await getToken(ctx, contextId);
          if (token == null) {
            return { hidden: true };
          }
          return {
            label: 'Access Token Response',
            inputs: [
              {
                type: 'editor',
                defaultValue: JSON.stringify(token.response, null, 2),
                hideLabel: true,
                readOnly: true,
                language: 'json',
              },
            ],
          };
        },
      },
    ],
    async onApply(ctx, { values, contextId }) {
      const headerPrefix = optionalString(values, 'headerPrefix') ?? '';
      const grantType = requiredString(values, 'grantType') as GrantType;
      const credentialsInBody = values.credentials === 'body';

      console.log('Performing OAuth', values);
      let token: AccessToken;
      if (grantType === 'authorization_code') {
        const authorizationUrl = requiredString(values, 'authorizationUrl');
        const accessTokenUrl = requiredString(values, 'accessTokenUrl');
        token = await getAuthorizationCode(ctx, contextId, {
          accessTokenUrl: accessTokenUrl.match(/^https?:\/\//) ? accessTokenUrl : `https://${accessTokenUrl}`,
          authorizationUrl: authorizationUrl.match(/^https?:\/\//) ? authorizationUrl : `https://${authorizationUrl}`,
          clientId: requiredString(values, 'clientId'),
          clientSecret: requiredString(values, 'clientSecret'),
          redirectUri: optionalString(values, 'redirectUri'),
          scope: optionalString(values, 'scope'),
          state: optionalString(values, 'state'),
          credentialsInBody,
          pkce: values.usePkce ? {
            challengeMethod: requiredString(values, 'pkceChallengeMethod'),
            codeVerifier: optionalString(values, 'pkceCodeVerifier'),
          } : null,
        });
      } else if (grantType === 'implicit') {
        const authorizationUrl = requiredString(values, 'authorizationUrl');
        token = await getImplicit(ctx, contextId, {
          authorizationUrl: authorizationUrl.match(/^https?:\/\//) ? authorizationUrl : `https://${authorizationUrl}`,
          clientId: requiredString(values, 'clientId'),
          redirectUri: optionalString(values, 'redirectUri'),
          responseType: requiredString(values, 'responseType'),
          scope: optionalString(values, 'scope'),
          state: optionalString(values, 'state'),
        });
      } else if (grantType === 'client_credentials') {
        const accessTokenUrl = requiredString(values, 'accessTokenUrl');
        token = await getClientCredentials(ctx, contextId, {
          accessTokenUrl: accessTokenUrl.match(/^https?:\/\//) ? accessTokenUrl : `https://${accessTokenUrl}`,
          clientId: requiredString(values, 'clientId'),
          clientSecret: requiredString(values, 'clientSecret'),
          scope: optionalString(values, 'scope'),
          credentialsInBody,
        });
      } else if (grantType === 'password') {
        const accessTokenUrl = requiredString(values, 'accessTokenUrl');
        token = await getPassword(ctx, contextId, {
          accessTokenUrl: accessTokenUrl.match(/^https?:\/\//) ? accessTokenUrl : `https://${accessTokenUrl}`,
          clientId: requiredString(values, 'clientId'),
          clientSecret: requiredString(values, 'clientSecret'),
          username: requiredString(values, 'username'),
          password: requiredString(values, 'password'),
          scope: optionalString(values, 'scope'),
          credentialsInBody,
        });
      } else {
        throw new Error('Invalid grant type ' + grantType);
      }

      const headerValue = `${headerPrefix} ${token.response.access_token}`.trim();
      return {
        setHeaders: [{
          name: 'Authorization',
          value: headerValue,
        }],
      };
    },
  },
};

function optionalString(values: Record<string, JsonPrimitive | undefined>, name: string): string | null {
  const arg = values[name];
  if (arg == null || arg == '') return null;
  return `${arg}`;
}

function requiredString(values: Record<string, JsonPrimitive | undefined>, name: string): string {
  const arg = optionalString(values, name);
  if (!arg) throw new Error(`Missing required argument ${name}`);
  return arg;
}
