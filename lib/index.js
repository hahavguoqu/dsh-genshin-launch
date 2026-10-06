import { randomUUID } from 'node:crypto';
import { createController } from './controller.js';

export const name = 'genshin-launch';
export function apply(root, config = {}) {
  const token = randomUUID();
  const controller = createController(config);
  root.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_GENSHIN_TOKEN__', value: token });
  });
  root.inject(['webServer'], ctx => {
    for (const action of ['launch', 'select', 'status', 'setup', 'website']) {
      ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-genshin-launch/' + action,
      async handler(req, res) {
        const send = (status, body) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { ok: false, message: '仅支持 POST' }); }
        // A per-boot secret header prevents other websites from triggering a local launch.
        if (req.headers['x-dsh-genshin-token'] !== token || req.headers['sec-fetch-site'] === 'cross-site') {
          return send(403, { ok: false, message: '启动请求验证失败，请重新打开 Harness 窗口' });
        }
        const connection = ctx.get('connection');
        try {
          const rejection = connection?.requestRejection?.(req);
          if (rejection) return send(typeof rejection === 'number' ? rejection : 403, { ok: false, message: '宿主拒绝了请求' });
          if (process.platform !== 'win32') return send(400, { ok: false, message: '该插件需要 Windows 宿主' });
          return send(200, await controller[action]());
        } catch (error) { return send(500, { ok: false, message: error.message || '启动失败' }); }
      },
      }));
    }
  });
}
