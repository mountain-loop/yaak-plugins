import { Context, Environment, Folder, GrpcRequest, HttpRequest, PluginDefinition, Workspace } from '@yaakapp/api';
import YAML from 'yaml';

type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export interface ExportResources {
  workspaces: AtLeast<Workspace, 'name' | 'id' | 'model'>[];
  environments: AtLeast<Environment, 'name' | 'id' | 'model' | 'workspaceId'>[];
  httpRequests: AtLeast<HttpRequest, 'name' | 'id' | 'model' | 'workspaceId'>[];
  grpcRequests: AtLeast<GrpcRequest, 'name' | 'id' | 'model' | 'workspaceId'>[];
  folders: AtLeast<Folder, 'name' | 'id' | 'model' | 'workspaceId'>[];
}

export const plugin: PluginDefinition = {
  importer: {
    name: 'Insomnia',
    description: 'Import Insomnia workspaces',
    async onImport(_ctx: Context, args: { text: string }) {
      return convertInsomnia(args.text);
    },
  },
};

export function convertInsomnia(contents: string) {
  let parsed: any;

  try {
    parsed = JSON.parse(contents);
  } catch (e) {
  }

  try {
    parsed = parsed ?? YAML.parse(contents);
  } catch (e) {
  }

  if (!isJSObject(parsed)) return null;

  return convertInsomniaV5(parsed) ?? convertInsomniaV4(parsed);
}

function convertInsomniaV5(parsed: Record<string, any>) {
  if (!Array.isArray(parsed.collection)) return null;

  const resources: ExportResources = {
    workspaces: [],
    httpRequests: [],
    grpcRequests: [],
    environments: [],
    folders: [],
  };

  // Import workspaces
  const meta: Record<string, any> = parsed.meta ?? {};
  resources.workspaces.push({
    id: convertId(meta.id ?? 'collection'),
    createdAt: meta.created ? new Date(meta.created).toISOString().replace('Z', '') : undefined,
    updatedAt: meta.modified ? new Date(meta.modified).toISOString().replace('Z', '') : undefined,
    model: 'workspace',
    name: parsed.name,
    description: meta.description || undefined,
  });
  resources.environments.push(
    importEnvironment(parsed.environments, meta.id, true),
    ...(parsed.environments.subEnvironments ?? []).map((r: any) => importEnvironment(r, meta.id)),
  );

  const nextFolder = (children: any[], parentId: string) => {
    let sortPriority = 0;
    for (const child of children ?? []) {
      if (!isJSObject(child)) continue;

      if (Array.isArray(child.children)) {
        resources.folders.push(importFolderV5(child, meta.id, sortPriority++, parentId));
        nextFolder(child.children, child.meta.id);
      } else if (child.method) {
        resources.httpRequests.push(
          importHttpRequestV5(child, meta.id, parentId, sortPriority++),
        );
      } else if (child.protoFileId) {
        resources.grpcRequests.push(
          importGrpcRequestV5(child, meta.id, parentId, sortPriority++),
        );
      }
    }
  };

  // Import folders
  nextFolder(parsed.collection ?? [], meta.id);

  // Filter out any `null` values
  resources.httpRequests = resources.httpRequests.filter(Boolean);
  resources.grpcRequests = resources.grpcRequests.filter(Boolean);
  resources.environments = resources.environments.filter(Boolean);
  resources.workspaces = resources.workspaces.filter(Boolean);

  return { resources: deleteUndefinedAttrs(resources) };
}

function convertInsomniaV4(parsed: Record<string, any>) {
  if (!Array.isArray(parsed.resources)) return null;

  const resources: ExportResources = {
    workspaces: [],
    httpRequests: [],
    grpcRequests: [],
    environments: [],
    folders: [],
  };

  // Import workspaces
  const workspacesToImport = parsed.resources.filter(r => isJSObject(r) && r._type === 'workspace');
  for (const w of workspacesToImport) {
    resources.workspaces.push({
      id: convertId(w._id),
      createdAt: w.created ? new Date(w.created).toISOString().replace('Z', '') : undefined,
      updatedAt: w.updated ? new Date(w.updated).toISOString().replace('Z', '') : undefined,
      model: 'workspace',
      name: w.name,
      description: w.description || undefined,
    });
    const environmentsToImport = parsed.resources.filter(
      (r: any) => isJSObject(r) && r._type === 'environment',
    );
    resources.environments.push(
      ...environmentsToImport.map((r: any) => importEnvironment(r, w._id)),
    );

    const nextFolder = (parentId: string) => {
      const children = parsed.resources.filter((r: any) => r.parentId === parentId);
      let sortPriority = 0;
      for (const child of children) {
        if (!isJSObject(child)) continue;

        if (child._type === 'request_group') {
          resources.folders.push(importFolderV4(child, w._id));
          nextFolder(child._id);
        } else if (child._type === 'request') {
          resources.httpRequests.push(
            importHttpRequestV4(child, w._id, sortPriority++),
          );
        } else if (child._type === 'grpc_request') {
          resources.grpcRequests.push(
            importGrpcRequestV4(child, w._id, sortPriority++),
          );
        }
      }
    };

    // Import folders
    nextFolder(w._id);
  }

  // Filter out any `null` values
  resources.httpRequests = resources.httpRequests.filter(Boolean);
  resources.grpcRequests = resources.grpcRequests.filter(Boolean);
  resources.environments = resources.environments.filter(Boolean);
  resources.workspaces = resources.workspaces.filter(Boolean);

  return { resources: deleteUndefinedAttrs(resources) };
}

function importEnvironment(e: any, workspaceId: string, isParent?: boolean): ExportResources['environments'][0] {
  const id = e.meta?.id ?? e._id;
  const created = e.meta?.created ?? e.created;
  const updated = e.meta?.modified ?? e.updated;
  const sortKey = e.meta?.sortKey ?? e.sortKey;

  return {
    id: convertId(id),
    createdAt: created ? new Date(created).toISOString().replace('Z', '') : undefined,
    updatedAt: updated ? new Date(updated).toISOString().replace('Z', '') : undefined,
    workspaceId: convertId(workspaceId),
    // @ts-ignore
    sortPriority: sortKey, // Will be added to Yaak later
    base: isParent ?? e.parentId === workspaceId,
    model: 'environment',
    name: e.name,
    variables: Object.entries(e.data).map(([name, value]) => ({
      enabled: true,
      name,
      value: `${value}`,
    })),
  };
}

function importFolderV5(f: any, workspaceId: string, sortPriority: number, parentId: string): ExportResources['folders'][0] {
  const id = f.meta?.id ?? f._id;
  const created = f.meta?.created ?? f.created;
  const updated = f.meta?.modified ?? f.updated;

  return {
    model: 'folder',
    id: convertId(id),
    createdAt: created ? new Date(created).toISOString().replace('Z', '') : undefined,
    updatedAt: updated ? new Date(updated).toISOString().replace('Z', '') : undefined,
    folderId: parentId === workspaceId ? null : convertId(parentId),
    sortPriority,
    workspaceId: convertId(workspaceId),
    description: f.description || undefined,
    name: f.name,
  };
}

function importFolderV4(f: any, workspaceId: string): ExportResources['folders'][0] {
  return {
    id: convertId(f._id),
    createdAt: f.created ? new Date(f.created).toISOString().replace('Z', '') : undefined,
    updatedAt: f.updated ? new Date(f.updated).toISOString().replace('Z', '') : undefined,
    folderId: f.parentId === workspaceId ? null : convertId(f.parentId),
    workspaceId: convertId(workspaceId),
    description: f.description || undefined,
    model: 'folder',
    name: f.name,
  };
}

function importGrpcRequestV4(
  r: any,
  workspaceId: string,
  sortPriority = 0,
): ExportResources['grpcRequests'][0] {
  const parts = r.protoMethodName.split('/').filter((p: any) => p !== '');
  const service = parts[0] ?? null;
  const method = parts[1] ?? null;

  return {
    id: convertId(r.meta?.id ?? r._id),
    createdAt: r.created ? new Date(r.created).toISOString().replace('Z', '') : undefined,
    updatedAt: r.updated ? new Date(r.updated).toISOString().replace('Z', '') : undefined,
    workspaceId: convertId(workspaceId),
    folderId: r.parentId === workspaceId ? null : convertId(r.parentId),
    model: 'grpc_request',
    sortPriority,
    name: r.name,
    description: r.description || undefined,
    url: convertSyntax(r.url),
    service,
    method,
    message: r.body?.text ?? '',
    metadata: (r.metadata ?? [])
      .map((h: any) => ({
        enabled: !h.disabled,
        name: h.name ?? '',
        value: h.value ?? '',
      }))
      .filter(({ name, value }: any) => name !== '' || value !== ''),
  };
}

function importGrpcRequestV5(
  r: any,
  workspaceId: string,
  parentId: string,
  sortPriority = 0,
): ExportResources['grpcRequests'][0] {
  const id = r.meta?.id ?? r._id;
  const created = r.meta?.created ?? r.created;
  const updated = r.meta?.modified ?? r.updated;

  const parts = r.protoMethodName.split('/').filter((p: any) => p !== '');
  const service = parts[0] ?? null;
  const method = parts[1] ?? null;

  return {
    model: 'grpc_request',
    id: convertId(id),
    workspaceId: convertId(workspaceId),
    createdAt: created ? new Date(created).toISOString().replace('Z', '') : undefined,
    updatedAt: updated ? new Date(updated).toISOString().replace('Z', '') : undefined,
    folderId: parentId === workspaceId ? null : convertId(parentId),
    sortPriority,
    name: r.name,
    description: r.description || undefined,
    url: convertSyntax(r.url),
    service,
    method,
    message: r.body?.text ?? '',
    metadata: (r.metadata ?? [])
      .map((h: any) => ({
        enabled: !h.disabled,
        name: h.name ?? '',
        value: h.value ?? '',
      }))
      .filter(({ name, value }: any) => name !== '' || value !== ''),
  };
}

function importHttpRequestV5(
  r: any,
  workspaceId: string,
  parentId: string,
  sortPriority = 0,
): ExportResources['httpRequests'][0] {
  const id = r.meta?.id ?? r._id;
  const created = r.meta?.created ?? r.created;
  const updated = r.meta?.modified ?? r.updated;

  let bodyType: string | null = null;
  let body = {};
  if (r.body.mimeType === 'application/octet-stream') {
    bodyType = 'binary';
    body = { filePath: r.body.fileName ?? '' };
  } else if (r.body?.mimeType === 'application/x-www-form-urlencoded') {
    bodyType = 'application/x-www-form-urlencoded';
    body = {
      form: (r.body.params ?? []).map((p: any) => ({
        enabled: !p.disabled,
        name: p.name ?? '',
        value: p.value ?? '',
      })),
    };
  } else if (r.body?.mimeType === 'multipart/form-data') {
    bodyType = 'multipart/form-data';
    body = {
      form: (r.body.params ?? []).map((p: any) => ({
        enabled: !p.disabled,
        name: p.name ?? '',
        value: p.value ?? '',
        file: p.fileName ?? null,
      })),
    };
  } else if (r.body?.mimeType === 'application/graphql') {
    bodyType = 'graphql';
    body = { text: convertSyntax(r.body.text ?? '') };
  } else if (r.body?.mimeType === 'application/json') {
    bodyType = 'application/json';
    body = { text: convertSyntax(r.body.text ?? '') };
  }

  let authenticationType: string | null = null;
  let authentication = {};
  if (r.authentication.type === 'bearer') {
    authenticationType = 'bearer';
    authentication = {
      token: convertSyntax(r.authentication.token),
    };
  } else if (r.authentication.type === 'basic') {
    authenticationType = 'basic';
    authentication = {
      username: convertSyntax(r.authentication.username),
      password: convertSyntax(r.authentication.password),
    };
  }

  return {
    id: convertId(id),
    workspaceId: convertId(workspaceId),
    createdAt: created ? new Date(created).toISOString().replace('Z', '') : undefined,
    updatedAt: updated ? new Date(updated).toISOString().replace('Z', '') : undefined,
    folderId: parentId === workspaceId ? null : convertId(parentId),
    sortPriority,
    model: 'http_request',
    name: r.name,
    description: r.meta?.description || undefined,
    url: convertSyntax(r.url),
    body,
    bodyType,
    authentication,
    authenticationType,
    method: r.method,
    headers: (r.headers ?? [])
      .map((h: any) => ({
        enabled: !h.disabled,
        name: h.name ?? '',
        value: h.value ?? '',
      }))
      .filter(({ name, value }: any) => name !== '' || value !== ''),
  };
}

function importHttpRequestV4(
  r: any,
  workspaceId: string,
  sortPriority = 0,
): ExportResources['httpRequests'][0] {
  let bodyType: string | null = null;
  let body = {};
  if (r.body.mimeType === 'application/octet-stream') {
    bodyType = 'binary';
    body = { filePath: r.body.fileName ?? '' };
  } else if (r.body?.mimeType === 'application/x-www-form-urlencoded') {
    bodyType = 'application/x-www-form-urlencoded';
    body = {
      form: (r.body.params ?? []).map((p: any) => ({
        enabled: !p.disabled,
        name: p.name ?? '',
        value: p.value ?? '',
      })),
    };
  } else if (r.body?.mimeType === 'multipart/form-data') {
    bodyType = 'multipart/form-data';
    body = {
      form: (r.body.params ?? []).map((p: any) => ({
        enabled: !p.disabled,
        name: p.name ?? '',
        value: p.value ?? '',
        file: p.fileName ?? null,
      })),
    };
  } else if (r.body?.mimeType === 'application/graphql') {
    bodyType = 'graphql';
    body = { text: convertSyntax(r.body.text ?? '') };
  } else if (r.body?.mimeType === 'application/json') {
    bodyType = 'application/json';
    body = { text: convertSyntax(r.body.text ?? '') };
  }

  let authenticationType: string | null = null;
  let authentication = {};
  if (r.authentication.type === 'bearer') {
    authenticationType = 'bearer';
    authentication = {
      token: convertSyntax(r.authentication.token),
    };
  } else if (r.authentication.type === 'basic') {
    authenticationType = 'basic';
    authentication = {
      username: convertSyntax(r.authentication.username),
      password: convertSyntax(r.authentication.password),
    };
  }

  return {
    id: convertId(r.meta?.id ?? r._id),
    createdAt: r.created ? new Date(r.created).toISOString().replace('Z', '') : undefined,
    updatedAt: r.updated ? new Date(r.updated).toISOString().replace('Z', '') : undefined,
    workspaceId: convertId(workspaceId),
    folderId: r.parentId === workspaceId ? null : convertId(r.parentId),
    model: 'http_request',
    sortPriority,
    name: r.name,
    description: r.description || undefined,
    url: convertSyntax(r.url),
    body,
    bodyType,
    authentication,
    authenticationType,
    method: r.method,
    headers: (r.headers ?? [])
      .map((h: any) => ({
        enabled: !h.disabled,
        name: h.name ?? '',
        value: h.value ?? '',
      }))
      .filter(({ name, value }: any) => name !== '' || value !== ''),
  };
}

function convertSyntax(variable: string): string {
  if (!isJSString(variable)) return variable;
  return variable.replaceAll(/{{\s*(_\.)?([^}]+)\s*}}/g, '${[$2]}');
}

function isJSObject(obj: any) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}

function isJSString(obj: any) {
  return Object.prototype.toString.call(obj) === '[object String]';
}

function convertId(id: string): string {
  if (id.startsWith('GENERATE_ID::')) {
    return id;
  }
  return `GENERATE_ID::${id}`;
}

function deleteUndefinedAttrs<T>(obj: T): T {
  if (Array.isArray(obj) && obj != null) {
    return obj.map(deleteUndefinedAttrs) as T;
  } else if (typeof obj === 'object' && obj != null) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, deleteUndefinedAttrs(v)]),
    ) as T;
  } else {
    return obj;
  }
}
