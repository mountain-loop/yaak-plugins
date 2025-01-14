import { Context } from '@yaakapp/api';
import { describe, expect, test } from 'vitest';
import { pluginHookImport } from '../src';

const ctx = {} as Context;

describe('importer-yaak', () => {
  test('Skips invalid imports', () => {
    expect(pluginHookImport(ctx, 'not JSON')).toBeUndefined();
    expect(pluginHookImport(ctx, '[]')).toBeUndefined();
    expect(pluginHookImport(ctx, JSON.stringify({ resources: {} }))).toBeUndefined();
  });

  test('converts schema 1 to 2', () => {
    const imported = pluginHookImport(
      ctx,
      JSON.stringify({
        yaakSchema: 1,
        resources: {
          requests: [],
        },
      }),
    );

    expect(imported).toEqual(
      expect.objectContaining({
        resources: {
          httpRequests: [],
        },
      }),
    );
  });
  test('converts schema 2 to 3', () => {
    const imported = pluginHookImport(
      ctx,
      JSON.stringify({
        yaakSchema: 2,
        resources: {
          environments: [{
            id: 'e_1',
            workspaceId: 'w_1',
            name: 'Production',
            variables: [{ name: 'E1', value: 'E1!' }],
          }],
          workspaces: [{
            id: 'w_1',
            variables: [{ name: 'W1', value: 'W1!' }],
          }],
        },
      }),
    );

    expect(imported).toEqual(
      expect.objectContaining({
        resources: {
          workspaces: [{
            id: 'w_1',
          }],
          environments: [{
            id: 'e_1',
            environmentId: 'GENERATE_ID::base_env_w_1',
            workspaceId: 'w_1',
            name: 'Production',
            variables: [{ name: 'E1', value: 'E1!' }],
          }, {
            id: 'GENERATE_ID::base_env_w_1',
            workspaceId: 'w_1',
            name: 'Global Variables',
            variables: [{ name: 'W1', value: 'W1!' }],
          }],
        },
      }),
    );
  });
});
