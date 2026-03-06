import { parse as parseYaml } from 'yaml';
import type { AppConfig } from './types.js';

let config: AppConfig;

export function getConfig(): AppConfig {
    if (config) return config;

    // 默认配置
    config = {
        port: 3010,
        timeout: 120,
        cursorModel: 'anthropic/claude-sonnet-4.6',
        fingerprint: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
    };

    // 从 config.yaml 加载 (Deno 兼容)
    try {
        const raw = Deno.readTextFileSync('config.yaml');
        const yaml = parseYaml(raw);
        if (yaml.port) config.port = yaml.port;
        if (yaml.timeout) config.timeout = yaml.timeout;
        if (yaml.proxy) config.proxy = yaml.proxy;
        if (yaml.cursor_model) config.cursorModel = yaml.cursor_model;
        if (yaml.fingerprint) {
            if (yaml.fingerprint.user_agent) config.fingerprint.userAgent = yaml.fingerprint.user_agent;
        }
    } catch (e) {
        // 文件不存在或读取失败，使用默认配置
        if (e instanceof Deno.errors.NotFound) {
            console.log('[Config] config.yaml 不存在，使用默认配置');
        } else {
            console.warn('[Config] 读取 config.yaml 失败:', e);
        }
    }

    // 环境变量覆盖 (Deno 兼容)
    const PORT = Deno.env.get('PORT');
    const TIMEOUT = Deno.env.get('TIMEOUT');
    const PROXY = Deno.env.get('PROXY');
    const CURSOR_MODEL = Deno.env.get('CURSOR_MODEL');
    const FP = Deno.env.get('FP');

    if (PORT) config.port = parseInt(PORT);
    if (TIMEOUT) config.timeout = parseInt(TIMEOUT);
    if (PROXY) config.proxy = PROXY;
    if (CURSOR_MODEL) config.cursorModel = CURSOR_MODEL;

    // 从 base64 FP 环境变量解析指纹
    if (FP) {
        try {
            const fp = JSON.parse(atob(FP));
            if (fp.userAgent) config.fingerprint.userAgent = fp.userAgent;
        } catch (e) {
            console.warn('[Config] 解析 FP 环境变量失败:', e);
        }
    }

    return config;
}
