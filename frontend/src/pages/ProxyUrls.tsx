import { useEffect, useState } from 'react';
import {
  getProxyUrls,
  createProxyUrl,
  updateProxyUrl,
  deleteProxyUrl,
  type ProxyUrl,
} from '../api';

const empty: ProxyUrl = { id: '', type: 'auto', url: '', provider_name: '' };

export default function ProxyUrls() {
  const [items, setItems] = useState<ProxyUrl[]>([]);
  const [edit, setEdit] = useState<ProxyUrl | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => getProxyUrls().then(setItems).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const save = async (data: ProxyUrl) => {
    if (data.id) {
      await updateProxyUrl(data.id, data);
    } else {
      await createProxyUrl(data);
    }
    setEdit(null);
    setShowAdd(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await deleteProxyUrl(id);
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
        <h2>订阅管理</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          添加订阅
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Provider 名称</th>
            <th>URL</th>
            <th>类型</th>
            <th style={{ width: 160 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.provider_name || <span style={{ color: '#999' }}>自动生成</span>}</td>
              <td>
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{item.url}</code>
              </td>
              <td>
                <span className={`tag ${item.type === 'auto' ? 'tag-auto' : 'tag-nonauto'}`}>
                  {item.type === 'auto' ? '自动' : '非自动'}
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
            <h3 style={{ marginBottom: '1rem' }}>{edit?.id ? '编辑订阅' : '添加订阅'}</h3>
            <UrlForm
              data={edit ?? { ...empty }}
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

function UrlForm({
  data,
  onSave,
  onCancel,
}: {
  data: ProxyUrl;
  onSave: (d: ProxyUrl) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(data);
  return (
    <div>
      <div className="form-group">
        <label>类型</label>
        <select
          value={d.type}
          onChange={(e) => setD({ ...d, type: e.target.value as 'auto' | 'nonauto' })}
        >
          <option value="auto">自动 (Auto)</option>
          <option value="nonauto">非自动 (Non-auto)</option>
        </select>
      </div>
      <div className="form-group">
        <label>Provider 名称 (留空自动生成)</label>
        <input
          value={d.provider_name}
          onChange={(e) => setD({ ...d, provider_name: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>URL</label>
        <input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}>取消</button>
        <button className="btn-primary" onClick={() => onSave(d)}>
          保存
        </button>
      </div>
    </div>
  );
}
