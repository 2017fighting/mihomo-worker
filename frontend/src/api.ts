const BASE = '/admin/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Unknown error');
  return json.data as T;
}

export interface ProxyUrl {
  id: string;
  type: 'auto' | 'nonauto';
  url: string;
  provider_name: string;
}

export interface Proxy {
  id: string;
  proxy_type: 'auto' | 'nonauto';
  proto: string;
  name: string;
  server: string;
  port: number;
  config: string;
}

export interface Ruleset {
  id: string;
  name: string;
  behavior: string;
  content: string;
  target: string;
  no_resolve: number;
  sort_order: number;
}

export interface Endpoint {
  key: string;
  path: string;
}

export interface AccessStats {
  total: number;
  last24h: number;
  last7d: number;
  byCountry: { country: string; count: number }[];
  recent: { id: number; path: string; ip: string; country: string; created_at: string }[];
}

export const getProxyUrls = () => request<ProxyUrl[]>(`${BASE}/proxy-urls`);
export const createProxyUrl = (data: { type: string; url: string; provider_name?: string }) =>
  request<ProxyUrl>(`${BASE}/proxy-urls`, { method: 'POST', body: JSON.stringify(data) });
export const updateProxyUrl = (id: string, data: Partial<ProxyUrl>) =>
  request(`${BASE}/proxy-urls/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProxyUrl = (id: string) =>
  request(`${BASE}/proxy-urls/${id}`, { method: 'DELETE' });

export const getProxies = () => request<Proxy[]>(`${BASE}/proxies`);
export const createProxy = (data: { proxy_type: string; yaml: string }) =>
  request<Proxy>(`${BASE}/proxies`, { method: 'POST', body: JSON.stringify(data) });
export const updateProxy = (id: string, data: { proxy_type?: string; yaml?: string }) =>
  request(`${BASE}/proxies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProxy = (id: string) => request(`${BASE}/proxies/${id}`, { method: 'DELETE' });

export const getRulesets = () => request<Ruleset[]>(`${BASE}/rulesets`);
export const createRuleset = (data: Omit<Ruleset, 'id' | 'sort_order'>) =>
  request<Ruleset>(`${BASE}/rulesets`, { method: 'POST', body: JSON.stringify(data) });
export const updateRuleset = (id: string, data: Partial<Ruleset>) =>
  request(`${BASE}/rulesets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const moveRuleset = (id: string, sort_order: number) =>
  request(`${BASE}/rulesets/${id}/move`, { method: 'PUT', body: JSON.stringify({ sort_order }) });
export const deleteRuleset = (id: string) =>
  request(`${BASE}/rulesets/${id}`, { method: 'DELETE' });

export const getEndpoints = () => request<Endpoint[]>(`${BASE}/endpoints`);
export const resetEndpoint = (key: string) =>
  request<{ key: string; path: string }>(`${BASE}/endpoints`, {
    method: 'POST',
    body: JSON.stringify({ key }),
  });

export const getStats = () => request<AccessStats>(`${BASE}/stats`);
