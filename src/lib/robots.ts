import { checkFetchPermissionError } from './errors.ts';
import { getAuthHeaders, getMuxBaseUrl } from './mux.ts';

const ROBOTS_BASE = '/robots/v1';

export type RobotsWorkflow =
  | 'ask-questions'
  | 'find-key-moments'
  | 'generate-chapters'
  | 'moderate'
  | 'summarize'
  | 'translate-captions';

// biome-ignore lint/suspicious/noExplicitAny: API responses are dynamic
type ApiResponse = Record<string, any>;

/**
 * Make an authenticated request to the Mux Robots API.
 * Handles error responses with permission checking.
 */
async function robotsFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl = getMuxBaseUrl();
  const headers = await getAuthHeaders();

  const response = await fetch(`${baseUrl}${ROBOTS_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    // Try to parse the error body before falling through to generic handling
    const body = await response.text();
    let parsedError: { type?: string; messages?: string[] } | undefined;
    try {
      const json = JSON.parse(body);
      parsedError = json.error;
    } catch {
      // not JSON
    }

    // Surface the specific API error message when available
    if (parsedError?.messages?.length) {
      throw new Error(parsedError.messages.join(' '));
    }

    const permError = await checkFetchPermissionError(
      new Response(body, {
        status: response.status,
        headers: response.headers,
      }),
    );
    if (permError) {
      throw new Error(permError);
    }

    const message = parsedError?.type ?? parsedError?.messages?.[0] ?? body;
    throw new Error(`Robots API error (${response.status}): ${message}`);
  }

  return response;
}

export interface ListJobsParams {
  workflow?: string;
  status?: string;
  assetId?: string;
  limit?: number;
  page?: number;
}

export async function listJobs(
  params: ListJobsParams = {},
): Promise<ApiResponse> {
  const searchParams = new URLSearchParams();
  if (params.workflow) searchParams.set('workflow', params.workflow);
  if (params.status) searchParams.set('status', params.status);
  if (params.assetId) searchParams.set('asset_id', params.assetId);
  if (params.limit !== undefined)
    searchParams.set('limit', String(params.limit));
  if (params.page !== undefined) searchParams.set('page', String(params.page));

  const qs = searchParams.toString();
  const response = await robotsFetch(`/jobs${qs ? `?${qs}` : ''}`);
  return (await response.json()) as ApiResponse;
}

export async function getJob(
  workflow: string,
  jobId: string,
): Promise<ApiResponse> {
  const response = await robotsFetch(`/jobs/${workflow}/${jobId}`);
  return (await response.json()) as ApiResponse;
}

export async function deleteJob(jobId: string): Promise<void> {
  await robotsFetch(`/jobs/${jobId}`, { method: 'DELETE' });
}

export async function cancelJob(jobId: string): Promise<ApiResponse> {
  const response = await robotsFetch(`/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
  return (await response.json()) as ApiResponse;
}

export async function createJob(
  workflow: RobotsWorkflow,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  const response = await robotsFetch(`/jobs/${workflow}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as ApiResponse;
}
