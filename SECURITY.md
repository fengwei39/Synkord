# Security Policy

## 支持的版本

| 版本 | 支持状态 |
|---|---|
| 最新 release (`v*.*.*`) | ✅ Active |
| 上一稳定版 | ⚠️ 仅严重安全更新 |
| 旧版 / 预发布 | ❌ 不维护 |

## 报告安全漏洞

**请勿** 在公开的 GitHub Issues / Discussions 里报告安全漏洞。

请通过以下任一方式私下报告：

- **GitHub Security Advisories**：[创建私密 advisory](https://github.com/synkord/synkord/security/advisories/new)（首选）
- **Email**：security@synkord.dev
- **PGP**：[下载 key](https://synkord.dev/.well-known/pgp-key.asc)（如有）

### 报告应包含

1. **漏洞描述**（尽量详细）
2. **复现步骤**（含 PoC 代码 / payload）
3. **影响范围**（哪些版本、哪些功能受影响）
4. **潜在影响**（数据泄露 / 权限提升 / RCE 等）
5. **修复建议**（如有）
6. **你的联系方式**（邮箱 / Telegram / 微信）

### 我们的承诺

- **24 小时内**确认收到
- **72 小时内**给出初步评估
- **7 天内**给出修复计划（如确认是漏洞）
- 修复发布后 **公开致谢**（除非你要求匿名）
- 协调**披露时间表**，不抢先公开细节

## 已知安全问题

暂无。

## 安全最佳实践

### 自托管部署

详见 [docs/deployment.md §8](docs/deployment.md#8-监控--告警--备份) 末尾的"安全清单"。

**必须**：
- 改默认 admin 密码（`admin / admin123`）
- 用 `openssl rand -hex 32` 生成 `JWT_SECRET` / `MCP_TOKEN`
- HTTPS（Caddy 自动申请 Let's Encrypt）
- 定期 `docker compose pull && up -d` 升级

**建议**：
- 启用 SSH 密钥登录
- fail2ban 防 SSH 爆破
- 备份：每天 03:00 一次，本地 + 异地（OSS / S3）
- 监控：`/api/health` 接入 UptimeRobot

### 桌面端

- `~/.synkord/` 目录存本地 SQLite，权限应 `chmod 700`
- MCP 工具调用限制为本地 stdio（不接受网络）
- 不会上传任何数据到第三方服务器

### 开发者

- **永远不要** commit `.env` / `*.key` / `*.pem`（`.gitignore` 已配）
- PR 触发 GitHub Secret Scanning，泄露会自动告警
- 依赖更新通过 [Dependabot](.github/dependabot.yml)，security patch 自动 PR

## 安全更新流程

1. 私下收到漏洞报告
2. 维护者评估严重性
3. 修复开发在私有分支
4. 发布 patch version（`v0.1.0` → `v0.1.1`）
5. 公告安全公告（GitHub Security Advisory）
6. 公开致谢报告者

严重等级按 [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document) 评估。

## 安全相关资源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Go Security Best Practices](https://github.com/guardrailsio/awesome-go-security)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)

## 联系

- 安全相关：security@synkord.dev
- 一般问题：GitHub Issues / Discussions
