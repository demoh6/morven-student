import { authRequest } from '@/pages/auth/authApi';

export interface Suggestion {
  id: string;
  title: string;
  content: string;
  anonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSuggestion extends Suggestion {
  userId: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CreateSuggestionInput {
  title: string;
  content: string;
  anonymous?: boolean;
}

export async function submitSuggestion(
  input: CreateSuggestionInput,
): Promise<Suggestion> {
  const data = await authRequest<{ suggestion: Suggestion }>(
    '/api/suggestions',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.suggestion;
}

export async function listSuggestions(): Promise<AdminSuggestion[]> {
  const data = await authRequest<{ suggestions: AdminSuggestion[] }>(
    '/api/admin/suggestions',
  );
  return data.suggestions;
}

/** Permanently removes a suggestion (ADMIN only). */
export async function deleteSuggestion(id: string): Promise<void> {
  await authRequest<{ deleted: boolean }>(
    `/api/admin/suggestions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}