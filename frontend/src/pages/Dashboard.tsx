import { useEffect, useState } from 'react';
import {
  getProxies,
  getProxyUrls,
  getRulesets,
  getEndpoints,
  getStats,
  resetEndpoint,
  type AccessStats,
} from '../api';

export default function Dashboard() {
  const [proxyCount, setProxyCount] = useState(0);
  const [urlCount, setUrlCount] = useState(0);
  const [rulesetCount, setRulesetCount] = useState(0);
  const [endpoints, setEndpoints] = useState<{ key: string; path: string }[]>([]);
  const [stats, setStats] = useState<AccessStats | null>(null);

  useEffect(() => {
    Promise.all([getProxies(), getProxyUrls(), getRulesets(), getEndpoints(), getStats()])
      .then(([proxies, urls, rulesets, eps, s]) => {
        setProxyCount(proxies.length);
        setUrlCount(urls.length);
        setRulesetCount(rulesets.length);
        setEndpoints(eps);
        setStats(s);
      })
      .catch(console.error);
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>总览</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{urlCount}</div>
          <div style={{ color: '#666' }}>外部订阅</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{proxyCount}</div>
          <div style={{ color: '#666' }}>内部代理</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{rulesetCount}</div>
          <div style={{ color: '#666' }}>规则集</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.total ?? 0}</div>
          <div style={{ color: '#666', fontSize: 12 }}>
            总访问 · 24h: {stats?.last24h ?? 0} · 7d: {stats?.last7d ?? 0}
          </div>
        </div>
      </div>

      <h3 style={{ marginBottom: '0.75rem' }}>端点 Token</h3>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>用途</th>
              <th>Key</th>
              <th>Token / URL</th>
              <th style={{ width: 160 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => {
              const label =
                ep.key === 'yaml_token'
                  ? 'YAML 配置'
                  : ep.key === 'auto_proxy'
                    ? 'Auto 代理聚合'
                    : ep.key === 'nonauto_proxy'
                      ? 'Non-auto 代理聚合'
                      : ep.key;
              const urlPath = ep.key === 'yaml_token' ? `/y/${ep.path}` : `/p/${ep.path}`;
              return (
                <tr key={ep.key}>
                  <td>
                    <strong>{label}</strong>
                  </td>
                  <td>
                    <code>{ep.key}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{urlPath}</code>
                  </td>
                  <td>
                    <button
                      className="btn-primary btn-sm"
                      style={{ marginRight: 6 }}
                      onClick={async () => {
                        await navigator.clipboard.writeText(window.location.origin + urlPath);
                        const btn = document.activeElement as HTMLButtonElement;
                        btn.textContent = '已复制';
                        setTimeout(() => (btn.textContent = '复制'), 1500);
                      }}
                    >
                      复制
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        if (!confirm(`重置 ${label} 的 token？旧 URL 将失效。`)) return;
                        const r = await resetEndpoint(ep.key);
                        setEndpoints((prev) => prev.map((e) => (e.key === ep.key ? r : e)));
                      }}
                    >
                      重置
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {stats && stats.byCountry.length > 0 && (
        <>
          <h3 style={{ margin: '1.5rem 0 0.75rem' }}>访问国家分布</h3>
          <table>
            <thead>
              <tr>
                <th>国家</th>
                <th>次数</th>
              </tr>
            </thead>
            <tbody>
              {stats.byCountry.map((c) => (
                <tr key={c.country}>
                  <td>{c.country}</td>
                  <td>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ margin: '1.5rem 0 0.75rem' }}>最近访问</h3>
      <table>
        <thead>
          <tr>
            <th>路径</th>
            <th>IP</th>
            <th>国家</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {stats?.recent.map((r) => (
            <tr key={r.id}>
              <td>
                <code>{r.path}</code>
              </td>
              <td>{r.ip}</td>
              <td>{r.country}</td>
              <td>{r.created_at}</td>
            </tr>
          ))}
          {(!stats?.recent || stats.recent.length === 0) && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>
                暂无访问记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
