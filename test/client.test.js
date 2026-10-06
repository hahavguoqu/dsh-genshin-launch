import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function mountClient(responses) {
  let component, request, css, index = 0;
  const hooks = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect() {},
  };
  const sandbox = {
    window: { __ModuleLoader__: { load(module) {
      assert.equal(module.id, 'dsh-genshin-launch');
      const plugin = module.factory(id => { assert.equal(id, 'react'); return react; });
      plugin.apply({ effect: fn => fn(), slots: {
        inject(slot, fn) { assert.equal(slot, 'conversation.input.right'); fn(); },
        register(options, fn) { assert.equal(options.name, 'conversation.input.right'); component = fn; },
      } });
    } } },
    document: { createElement: () => ({ remove() {} }), head: { appendChild(style) { css = style.textContent; } } },
    clearTimeout, setTimeout: () => 0, __DSH_GENSHIN_TOKEN__: 'boot-token',
    __DSH_TRANSPORT__: { async fetch(url, options) { request = { url, options }; return { ok: true, json: async () => responses[url.split('/').at(-1)] }; } },
  };
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox);
  const render = () => { index = 0; return component(); };
  const buttons = node => node && typeof node === 'object' ? [...(node.type === 'button' ? [node] : []), ...node.children.flatMap(buttons)] : [];
  const find = label => buttons(render()).find(button => button.children.includes(label));
  return { render, find, request: () => request, css: () => css };
}

test('native slot button sends an authenticated request and preserves its label', async () => {
  const app = mountClient({ launch: { ok: true, state: 'launched', message: '已发送原神启动请求' } });
  assert.match(app.css(), /focus-visible/);
  assert.equal(app.find('原神启动').props.type, 'button');
  await app.find('原神启动').props.onClick();
  assert.equal(app.request().url, '/dsh-genshin-launch/launch');
  assert.equal(app.request().options.method, 'POST');
  assert.equal(app.request().options.headers['X-Dsh-Genshin-Token'], 'boot-token');
  assert.equal(app.render().children.at(-1), false);
  await app.find('原神启动').props.onClick();
  assert.equal(app.render().children.at(-1), false);
});
test('not-found screen offers native selection, then one-time setup; website has its own action', async () => {
  const app = mountClient({
    launch: { ok: true, state: 'not-found', message: '未找到原神' },
    select: { ok: true, state: 'needs-setup', path: 'E:\\游戏\\YuanShen.exe', message: '首次授权' },
    setup: { ok: true, state: 'launched', message: '已启动' },
    website: { ok: true, state: 'website', message: '已打开官网' },
  });
  await app.find('原神启动').props.onClick();
  assert.ok(app.find('未安装，打开官网'));
  await app.find('选择 YuanShen.exe').props.onClick();
  assert.equal(app.request().url, '/dsh-genshin-launch/select');
  await app.find('启用免确认并启动').props.onClick();
  assert.equal(app.request().url, '/dsh-genshin-launch/setup');
  assert.ok(app.render().children.at(-1));
  await app.find('原神启动').props.onClick();
  await app.find('未安装，打开官网').props.onClick();
  assert.equal(app.request().url, '/dsh-genshin-launch/website');
});
