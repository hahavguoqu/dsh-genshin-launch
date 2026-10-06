window.__ModuleLoader__.load({
  id: 'dsh-genshin-launch',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const css = `.dsh-genshin-wrap{display:inline-flex;align-items:center;gap:3px;position:relative}.dsh-genshin-button{font:inherit;font-size:13px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:999px;padding:5px 10px;min-height:30px;background:transparent;color:var(--dsw-alias-label-caption,#676c76);cursor:pointer}.dsh-genshin-button:hover,.dsh-genshin-menu:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}.dsh-genshin-button:focus-visible,.dsh-genshin-menu:focus-visible,.dsh-genshin-action:focus-visible{outline:2px solid #7da4eb;outline-offset:2px}.dsh-genshin-button:disabled,.dsh-genshin-action:disabled{opacity:.6;cursor:wait}.dsh-genshin-menu{border:0;background:transparent;color:var(--dsw-alias-label-caption,#676c76);font-size:15px;cursor:pointer;border-radius:7px;padding:3px}.dsh-genshin-panel{position:absolute;bottom:calc(100% + 10px);right:0;box-sizing:border-box;max-width:calc(100vw - 32px);width:300px;white-space:normal;padding:13px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#333);box-shadow:0 6px 24px #0002;font:inherit;font-size:13px;line-height:1.6;z-index:50}.dsh-genshin-panel p{margin:0 0 9px}.dsh-genshin-path{font-size:11px;color:var(--dsw-alias-label-caption,#676c76);overflow-wrap:anywhere;max-height:80px;overflow:auto}.dsh-genshin-actions{display:flex;flex-wrap:wrap;gap:7px}.dsh-genshin-action{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;padding:5px 9px;background:transparent;color:inherit;cursor:pointer}.dsh-genshin-primary{background:#426bd3;color:white;border-color:transparent}.dsh-genshin-close{float:right;border:0;background:transparent;color:inherit;cursor:pointer;font-size:17px;padding:0 0 4px 8px}`;
    function Button() {
      const [busy, setBusy] = React.useState('');
      const [result, setResult] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      const inFlight = React.useRef(false);
      const timer = React.useRef(null);
      const root = React.useRef(null);
      const mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        const outside = event => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => { mounted.current = false; clearTimeout(timer.current); document.removeEventListener('pointerdown', outside); };
      }, []);
      async function perform(action) {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(action); clearTimeout(timer.current);
        try {
          const send = globalThis.__DSH_TRANSPORT__?.fetch ?? globalThis.fetch;
          const response = await send('/dsh-genshin-launch/' + action, {
            method: 'POST', headers: { 'X-Dsh-Genshin-Token': globalThis.__DSH_GENSHIN_TOKEN__ },
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.message || '操作失败');
          if (!mounted.current) return;
          setResult(data); setOpen(true);
          if (data.state === 'launched' || data.state === 'website') timer.current = setTimeout(() => setOpen(false), 4000);
        } catch (error) {
          if (mounted.current) { setResult({ state: 'error', message: error.message || '无法连接原神启动插件' }); setOpen(true); }
        } finally { inFlight.current = false; if (mounted.current) setBusy(''); }
      }
      function action(label, name, primary = false) {
        return h('button', { type: 'button', className: 'dsh-genshin-action' + (primary ? ' dsh-genshin-primary' : ''),
          disabled: !!busy, onClick: () => perform(name) }, label);
      }
      const controls = [];
      if (result?.state === 'needs-setup') controls.push(action('启用免确认并启动', 'setup', true));
      if (result?.state === 'configured') controls.push(action('启动原神', 'launch', true));
      if (!['launched', 'website'].includes(result?.state)) {
        controls.push(action(result?.path ? '更换游戏位置' : '选择 YuanShen.exe', 'select'));
        controls.push(action('未安装，打开官网', 'website'));
      }
      const busyLabel = { launch: '启动中…', select: '选择中…', setup: '等待授权…', website: '打开中…' }[busy];
      return h('span', { className: 'dsh-genshin-wrap', ref: root,
        onKeyDown: event => { if (event.key === 'Escape') setOpen(false); } },
        h('button', { type: 'button', className: 'dsh-genshin-button', disabled: !!busy,
          title: '启动本机原神', 'aria-label': '原神启动', onMouseDown: event => event.preventDefault(),
          onClick: () => perform('launch') }, busyLabel || '原神启动'),
        h('button', { type: 'button', className: 'dsh-genshin-menu', disabled: !!busy,
          title: '原神启动设置', 'aria-label': '原神启动设置', 'aria-expanded': open,
          onClick: () => open ? setOpen(false) : perform('status') }, '⚙'),
        open && result && h('span', { className: 'dsh-genshin-panel', role: 'region', 'aria-label': '原神启动设置' },
          h('button', { className: 'dsh-genshin-close', type: 'button', 'aria-label': '关闭', onClick: () => setOpen(false) }, '×'),
          h('p', { role: 'status', 'aria-live': 'polite' }, result.message),
          result.path && h('p', { className: 'dsh-genshin-path' }, result.path),
          controls.length > 0 && h('span', { className: 'dsh-genshin-actions' }, ...controls)));
    }
    return { inject: ['slots'], apply(ctx) {
      ctx.effect(() => { const style = document.createElement('style'); style.textContent = css;
        document.head.appendChild(style); return () => style.remove(); });
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right', id: 'genshin-launch-button',
      }, Button));
    } };
  },
});
