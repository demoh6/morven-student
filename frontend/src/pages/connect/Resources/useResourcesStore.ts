import { create } from 'zustand';
import type { Resource, ResourceType } from '@/pages/connect/Resources/resources';
import {
  getResources,
  getResource,
  createResourceApi,
  updateResourceApi,
  deleteResourceApi,
  accessResourceApi,
  accessResourceByCodeApi,
  uploadResourceFiles,
  deleteResourceFileApi,
  downloadResourceFile,
  addResourceNoteApi,
  deleteResourceNoteApi,
  addResourceLinkApi,
  deleteResourceLinkApi,
} from '@/pages/connect/Resources/resourceApi';

export interface ResourceFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface ResourceNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

interface ResourceContent {
  files: ResourceFile[];
  notes: ResourceNote[];
  links: ResourceLink[];
}

interface ResourcesStore {
  resources: Resource[];
  contentMap: Record<string, ResourceContent>;
  loading: boolean;
  error: string | null;

  /** While non-null the detail page renders the 6-digit unlock form instead of the normal view. */
  lockedResourceId: string | null;

  fetchResources: () => Promise<void>;
  fetchResourceDetail: (id: string) => Promise<Resource | undefined>;
  createResource: (input: { title: string; description?: string; type: ResourceType; isPrivate?: boolean }) => Promise<Resource>;
  editResource: (id: string, input: { title?: string; description?: string | null; type?: ResourceType; isPrivate?: boolean }) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;

  /** Unlocks a private resource with its 6-digit access code. On success the
   *  store is updated (content + list entry) and `lockedResourceId` is cleared.
   *  On wrong code the backend error is thrown so the caller can display it. */
  unlockResource: (id: string, code: string) => Promise<void>;

  /** Adds a private resource to the caller's list using ONLY its 6-digit code. */
  addResourceByCode: (code: string) => Promise<Resource>;

  getContent: (id: string) => ResourceContent;

  addFiles: (resourceId: string, files: File[]) => Promise<void>;
  removeFile: (resourceId: string, fileId: string) => Promise<void>;
  downloadFile: (resourceId: string, file: ResourceFile) => Promise<void>;

  addNote: (resourceId: string, title: string, content: string) => Promise<void>;
  removeNote: (resourceId: string, noteId: string) => Promise<void>;

  addLink: (resourceId: string, title: string, url: string) => Promise<void>;
  removeLink: (resourceId: string, linkId: string) => Promise<void>;
}

const emptyContent: ResourceContent = { files: [], notes: [], links: [] };

function upsertInStore(
  resources: Resource[],
  contentMap: Record<string, ResourceContent>,
  detail: Resource & { files: ResourceFile[]; notes: ResourceNote[]; links: ResourceLink[] },
) {
  const { files, notes, links, ...base } = detail;
  return {
    resources: resources.some((r) => r.id === base.id)
      ? resources.map((r) => (r.id === base.id ? base : r))
      : [base, ...resources],
    contentMap: {
      ...contentMap,
      [base.id]: { files, notes, links },
    },
  };
}

export const useResourcesStore = create<ResourcesStore>((set, get) => ({
  resources: [],
  contentMap: {},
  loading: false,
  error: null,
  lockedResourceId: null,

  fetchResources: async () => {
    set({ loading: true, error: null });
    try {
      const resources = await getResources();
      set({ resources, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'حدث خطأ في جلب الموارد',
      });
    }
  },

  fetchResourceDetail: async (id) => {
    set({ loading: true, error: null });
    try {
      const detail = await getResource(id);
      set((s) => ({
        loading: false,
        lockedResourceId: null,
        ...upsertInStore(s.resources, s.contentMap, detail),
      }));
      const { files, notes, links, ...base } = detail;
      return base;
    } catch (err) {
      if ((err as { code?: string }).code === 'PRIVATE_RESOURCE') {
        set({ loading: false, error: null, lockedResourceId: id });
        return undefined;
      }
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'حدث خطأ في جلب المورد',
      });
      return undefined;
    }
  },

  createResource: async (input) => {
    const resource = await createResourceApi(input);
    set((s) => ({
      resources: [resource, ...s.resources],
      contentMap: { ...s.contentMap, [resource.id]: emptyContent },
    }));
    return resource;
  },

  editResource: async (id, input) => {
    const resource = await updateResourceApi(id, input);
    set((s) => ({
      resources: s.resources.map((r) => (r.id === id ? resource : r)),
    }));
  },

  deleteResource: async (id) => {
    await deleteResourceApi(id);
    set((s) => {
      const contentMap = { ...s.contentMap };
      delete contentMap[id];
      return {
        resources: s.resources.filter((r) => r.id !== id),
        contentMap,
      };
    });
  },

  unlockResource: async (id, code) => {
    const detail = await accessResourceApi(id, code);
    set((s) => ({
      lockedResourceId: null,
      ...upsertInStore(s.resources, s.contentMap, detail),
    }));
  },

  addResourceByCode: async (code) => {
    const detail = await accessResourceByCodeApi(code);
    const { files, notes, links, ...base } = detail;
    set((s) => ({
      lockedResourceId: null,
      ...upsertInStore(s.resources, s.contentMap, detail),
    }));
    return base;
  },

  getContent: (id) => get().contentMap[id] || emptyContent,

  addFiles: async (resourceId, files) => {
    await uploadResourceFiles(resourceId, files);
    await get().fetchResourceDetail(resourceId);
  },

  removeFile: async (resourceId, fileId) => {
    await deleteResourceFileApi(resourceId, fileId);
    await get().fetchResourceDetail(resourceId);
  },

  downloadFile: async (resourceId, file) => {
    await downloadResourceFile(resourceId, file.id, file.name);
  },

  addNote: async (resourceId, title, content) => {
    await addResourceNoteApi(resourceId, title, content);
    await get().fetchResourceDetail(resourceId);
  },

  removeNote: async (resourceId, noteId) => {
    await deleteResourceNoteApi(resourceId, noteId);
    await get().fetchResourceDetail(resourceId);
  },

  addLink: async (resourceId, title, url) => {
    await addResourceLinkApi(resourceId, title, url);
    await get().fetchResourceDetail(resourceId);
  },

  removeLink: async (resourceId, linkId) => {
    await deleteResourceLinkApi(resourceId, linkId);
    await get().fetchResourceDetail(resourceId);
  },
}));
