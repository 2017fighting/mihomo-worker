import { useEffect, useState } from 'react';
import { getProxies, createProxy, updateProxy, deleteProxy, type Proxy } from '../api';

function proxyToYaml(p: Proxy): string {
  const cfg = JSON.parse(p.config || '{}');
  const { uuid, ...safe } = cfg;
  const all = { name: p.name, type: p.proto, server: p.server, port: p.port, ...safe };
  const lines = ['- name: ' + all.name];
  for (const [k, v] of Object.entries(all)) {
    if (k === 'name') continue;
    if (typeof v === 'object' && v !== null) {
      lines.push(`  ${k}:`);
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        lines.push(`    ${nk}: ${nv}`);
      }
    } else {
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

export default function Proxies() {
  const [items, setItems] = useState<Proxy[]>([]);
  const [edit, setEdit] = useState<Proxy | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => getProxies().then(setItems).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const save = async (proxyType: string, yaml: string, id?: string) => {
    if (id) {
      await updateProxy(id, { proxy_type: proxyType, yaml });
    } else {
      await createProxy({ proxy_type: proxyType, yaml });
    }
    setEdit(null);
    setShowAdd(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await deleteProxy(id);
    load();
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2>代理节点</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          添加节点
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>协议</th>
            <th>服务器</th>
            <th>端口</th>
            <th>类型</th>
            <th style={{ width: 160 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                <code>{item.proto}</code>
              </td>
              <td>{item.server}</td>
              <td>{item.port}</td>
              <td>
                <span className={`tag ${item.proxy_type === 'auto' ? 'tag-auto' : 'tag-nonauto'}`}>
                  {item.proxy_type === 'auto' ? '自动' : '非自动'}
                </span>
              </td>
              <td>
                <button
                  className="btn-primary btn-sm"
                  style={{ marginRight: 8 }}
                  onClick={() => setEdit(item)}
                >
                  编辑
                </button>
                <button className="btn-danger btn-sm" onClick={() => del(item.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(edit || showAdd) && (
        <div
          className="modal-overlay"
          onClick={() => {
            setEdit(null);
            setShowAdd(false);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>{edit?.id ? '编辑节点' : '添加节点'}</h3>
            <ProxyForm
              initial={edit ?? undefined}
              onSave={save}
              onCancel={() => {
                setEdit(null);
                setShowAdd(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProxyForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Proxy;
  onSave: (proxyType: string, yaml: string, id?: string) => void;
  onCancel: () => void;
}) {
  const [proxyType, setProxyType] = useState<'auto' | 'nonauto'>(initial?.proxy_type ?? 'auto');
  const [yaml, setYaml] = useState(initial ? proxyToYaml(initial) : '');
  return (
    <div>
      <div className="form-group">
        <label>类型</label>
        <select
          value={proxyType}
          onChange={(e) => setProxyType(e.target.value as 'auto' | 'nonauto')}
        >
          <option value="auto">自动 (Auto)</option>
          <option value="nonauto">非自动 (Non-auto)</option>
        </select>
      </div>
      <div className="form-group">
        <label>代理节点定义 (YAML)</label>
        <textarea rows={12} value={yaml} onChange={(e) => setYaml(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}>取消</button>
        <button className="btn-primary" onClick={() => onSave(proxyType, yaml, initial?.id)}>
          保存
        </button>
      </div>
    </div>
  );
}
