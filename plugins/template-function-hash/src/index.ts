import { CallTemplateFunctionArgs, Context, PluginDefinition } from '@yaakapp/api';
import { createHash } from 'node:crypto';

const algorithms = ['md5', 'sha1', 'sha256', 'sha512'];

export const plugin: PluginDefinition = {
  templateFunctions: algorithms.map(algorithm => ({
    name: `hash.${algorithm}`,
    description: 'Hash a value to its hexidecimal representation',
    args: [
      {
        name: 'input',
        label: 'Input',
        placeholder: 'input text',
        type: 'text',
      },
    ],
    async onRender(_ctx: Context, args: CallTemplateFunctionArgs): Promise<string | null> {
      if (!args.values.input) return '';
      return createHash(algorithm)
        .update(args.values.input, 'utf-8')
        .digest('hex');
    },
  })),
};
