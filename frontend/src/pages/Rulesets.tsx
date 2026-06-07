import { useEffect, useState } from 'react';
import {
  getRulesets,
  createRuleset,
  updateRuleset,
  deleteRuleset,
  moveRuleset,
  type Ruleset,
} from '../api';

const empty = {
  id: '',
  name: '',
  behavior: 'domain',
  content: 'payload:\n',
  target: 'DIRECT',
  no_resolve: 0,
} as Ruleset;

export default function Rulesets() {
  const [items, setItems] = useState<Ruleset[]>([]);
  const [edit, setEdit] = useState<Ruleset | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => getRulesets().then(setItems).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const save = async (data: Ruleset) => {
    if (data.id) {
      await updateRuleset(data.id, data);
    } else {
      await createRuleset(data);
    }
    setEdit(null);
    setShowAdd(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await deleteRuleset(id);
    load();
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const target = items[idx + dir];
    if (!target) return;
    const newOrder = items.map((r) => {
      if (r.id === id) return { ...r, sort_order: target.sort_order };
      if (r.id === target.id) return { ...r, sort_order: items[idx].sort_order };
      return r;
    });
    setItems(newOrder.sort((a, b) => a.sort_order - b.sort_order));
    await moveRuleset(id, target.sort_order);
    await moveRuleset(target.id, items[idx].sort_order);
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
        <h2>规则集</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          添加规则集
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>名称</th>
            <th>行为</th>
            <th>目标</th>
            <th>NoResolve</th>
            <th style={{ width: 200 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id}>
              <td>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={() => move(item.id, -1)}
                    disabled={i === 0}
                    className="btn-sm"
                    style={{ background: '#eee', padding: '2px 6px' }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(item.id, 1)}
                    disabled={i === items.length - 1}
                    className="btn-sm"
                    style={{ background: '#eee', padding: '2px 6px' }}
                  >
                    ↓
                  </button>
                </div>
              </td>
              <td>
                <code>{item.name}</code>
              </td>
              <td>{item.behavior}</td>
              <td>
                <span className="tag">{item.target}</span>
              </td>
              <td>{item.no_resolve ? '是' : '否'}</td>
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
            <h3 style={{ marginBottom: '1rem' }}>{edit?.id ? '编辑规则集' : '添加规则集'}</h3>
            <RulesetForm
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

function RulesetForm({
  data,
  onSave,
  onCancel,
}: {
  data: Ruleset;
  onSave: (d: Ruleset) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(data);
  return (
    <div>
      <div className="form-group">
        <label>名称</label>
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div className="form-group">
        <label>行为</label>
        <select value={d.behavior} onChange={(e) => setD({ ...d, behavior: e.target.value })}>
          <option value="domain">domain</option>
          <option value="ipcidr">ipcidr</option>
          <option value="classical">classical</option>
        </select>
      </div>
      <div className="form-group">
        <label>目标</label>
        <input value={d.target} onChange={(e) => setD({ ...d, target: e.target.value })} />
        <small style={{ color: '#888' }}>允许输入不存在的目标，生成配置时会自动创建对应策略组</small>
      </div>
      <div className="form-group">
        <label>内容</label>
        <textarea
          rows={10}
          value={d.content}
          onChange={(e) => setD({ ...d, content: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'normal' }}>
          <input
            type="checkbox"
            checked={d.no_resolve === 1}
            onChange={(e) => setD({ ...d, no_resolve: e.target.checked ? 1 : 0 })}
          />
          <span>no-resolve</span>
        </label>
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
