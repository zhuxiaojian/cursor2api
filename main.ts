/**
 * Cursor2API v2 - Deno 入口
 *
 * 使用 Oak 框架，兼容 Deno Deploy
 */

import { Application, Router } from 'npm:oak@^16.0.0';
import { getConfig } from './src/config.js';
import { handleMessages, listModels, countTokens } from './src/handler.js';
import { handleOpenAIChatCompletions } from './src/openai-handler.js';

const config = getConfig();
const app = new Application();
const router = new Router();

// Express 风格的请求/响应适配器
function expressMiddleware(
    handler: (req: any, res: any) => void | Promise<void>
) {
    return async (ctx: any) => {
        // 解析 JSON body
        let body: any = {};
        try {
            const contentType = ctx.request.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const rawBody = await ctx.request.body({ type: 'json' }).value;
                body = rawBody;
            }
        } catch (e) {
            // 解析失败，使用空对象
        }

        const req = {
            body,
            query: ctx.request.url.searchParams,
            method: ctx.request.method,
            url: ctx.request.url.toString(),
        };

        // SSE 流式响应支持
        let isStreaming = false;
        let streamController: ReadableStreamDefaultController<any> | null = null;

        const res = {
            json: (data: any) => {
                if (!isStreaming) {
                    ctx.response.body = data;
                    ctx.response.type = 'application/json';
                }
            },
            status: (code: number) => {
                ctx.response.status = code;
                return res;
            },
            writeHead: (status: number, headers: Record<string, string>) => {
                ctx.response.status = status;
                for (const [key, value] of Object.entries(headers)) {
                    ctx.response.headers.set(key, value);
                }
                // 检查是否是流式响应
                if (headers['Content-Type']?.includes('text/event-stream')) {
                    isStreaming = true;
                    const stream = new ReadableStream({
                        start(controller) {
                            streamController = controller;
                        },
                    });
                    ctx.response.body = stream;
                }
            },
            write: (chunk: string) => {
                if (isStreaming && streamController) {
                    streamController.enqueue(new TextEncoder().encode(chunk));
                }
            },
            end: () => {
                if (isStreaming && streamController) {
                    streamController.close();
                }
            },
            flush: () => {
                // Deno/Oak 不需要手动 flush
            },
        };

        await handler(req, res);
    };
}

// CORS 中间件
app.use(async (ctx, next) => {
    ctx.response.headers.set('Access-Control-Allow-Origin', '*');
    ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    ctx.response.headers.set('Access-Control-Allow-Headers', '*');
    if (ctx.request.method === 'OPTIONS') {
        ctx.response.status = 200;
        return;
    }
    await next();
});

// ==================== 路由 ====================

// Anthropic Messages API
router.post('/v1/messages', expressMiddleware(handleMessages));
router.post('/messages', expressMiddleware(handleMessages));

// OpenAI Chat Completions API（兼容）
router.post('/v1/chat/completions', expressMiddleware(handleOpenAIChatCompletions));
router.post('/chat/completions', expressMiddleware(handleOpenAIChatCompletions));

// Token 计数
router.post('/v1/messages/count_tokens', expressMiddleware(countTokens));
router.post('/messages/count_tokens', expressMiddleware(countTokens));

// OpenAI 兼容模型列表
router.get('/v1/models', expressMiddleware(listModels));

// 健康检查
router.get('/health', (ctx) => {
    ctx.response.body = { status: 'ok', version: '2.0.0' };
    ctx.response.type = 'application/json';
});

// 根路径
router.get('/', (ctx) => {
    ctx.response.body = {
        name: 'cursor2api',
        version: '2.0.0',
        description: 'Cursor Docs AI → Anthropic & OpenAI API Proxy',
        endpoints: {
            anthropic_messages: 'POST /v1/messages',
            openai_chat: 'POST /v1/chat/completions',
            models: 'GET /v1/models',
            health: 'GET /health',
        },
        usage: {
            claude_code: `export ANTHROPIC_BASE_URL=http://localhost:${config.port}`,
            openai_compatible: `OPENAI_BASE_URL=http://localhost:${config.port}/v1`,
        },
    };
    ctx.response.type = 'application/json';
});

app.use(router.routes());
app.use(router.allowedMethods());

// ==================== 启动 ====================

const port = config.port;

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║        Cursor2API v2.0.0             ║');
console.log('  ╠══════════════════════════════════════╣');
console.log(`  ║  Server:  http://localhost:${port}      ║`);
console.log('  ║  Model:   ' + config.cursorModel.padEnd(26) + '║');
console.log('  ╠══════════════════════════════════════╣');
console.log('  ║  API Endpoints:                      ║');
console.log('  ║  • Anthropic: /v1/messages            ║');
console.log('  ║  • OpenAI:   /v1/chat/completions     ║');
console.log('  ╠══════════════════════════════════════╣');
console.log('  ║  Claude Code:                        ║');
console.log(`  ║  export ANTHROPIC_BASE_URL=           ║`);
console.log(`  ║    http://localhost:${port}              ║`);
console.log('  ║  OpenAI 兼容:                        ║');
console.log(`  ║  OPENAI_BASE_URL=                     ║`);
console.log(`  ║    http://localhost:${port}/v1            ║`);
console.log('  ╚══════════════════════════════════════╝');
console.log('');

await app.listen({ port });
