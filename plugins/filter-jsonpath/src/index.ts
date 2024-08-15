import { YaakContext } from '@yaakapp/api';
import jp from 'jsonpath';

export function pluginHookResponseFilter(_ctx: YaakContext, args: { filter: string; body: string }) {
  const parsed = JSON.parse(args.body);
  const filtered = jp.query(parsed, args.filter);
  return JSON.stringify(filtered, null, 2);
}
