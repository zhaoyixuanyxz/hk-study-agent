# Phase 3：方案生成链与错误码

**版本**：v1.0  
**对应 Epic**：P3-AI-01、P3-AI-02

## 1. 输入消费（仅 planInputView）

方案生成链**只**读取 `planInputView` 中已结构化的维度，不读取原始对话：

| 维度 | 用途 |
|------|------|
| `academic` | 院校背景、GPA、语言等，用于竞争力与表述强度 |
| `goals` | 国家/地区、专业方向、职业倾向 |
| `budget` | 预算建议与档位内风险提示 |
| `timeline` | 入学季、申请窗口与时间线建议 |
| `riskPreference` | 与冲刺/匹配/保底三档叙事对齐 |
| `readiness` | **门禁**：`ready !== true` 时不调用模型，直接返回 `READINESS_NOT_MET` |

### 可信度规则（MVP）

- `source === "confirmed"`：可作为主依据。
- `candidate`：可引用，但表述中避免绝对化；若某维度几乎仅有 candidate/inferred，应降低确定性或提示用户确认。
- `inferred`：仅作辅助，不得单独支撑「录取概率」类结论。

## 2. 结构化输出

成功时返回体中的 `plan` 字段须符合 [schemas/plan-result.schema.json](schemas/plan-result.schema.json)。

最小字段：

- `disclaimer`：免责声明全文（与 [Phase3-方案输出规范与文案](Phase3-方案输出规范与文案.md) 对齐）
- `risk_summary` / `budget_suggestion` / `timeline_suggestion`
- `tiers.reach|match|safety`：每档 `label`（冲刺/匹配/保底）、`summary`、`rationale`

## 3. 错误码与 HTTP 状态

| code | HTTP | retryable | 含义 |
|------|------|-----------|------|
| `READINESS_NOT_MET` | 400 | false | `planInputView.readiness.ready !== true` 或缺少最新快照 |
| `INPUT_INCOMPLETE` | 400 | false | 无画像快照或 `planInputView` 为空 |
| `GENERATION_FAILED` | 502 | true | 模型调用失败或输出无法解析为合法结构 |
| `GENERATION_TIMEOUT` | 502 | true | 模型调用超过 `PLAN_GENERATION_TIMEOUT_MS`（见后端环境变量） |
| `UNSUPPORTED_CASE` | 400 | false | 输入组合无法生成合理解（MVP 极少使用） |

### 统一失败响应形状

```json
{
  "ok": false,
  "code": "READINESS_NOT_MET",
  "message": "人类可读说明",
  "retryable": false,
  "suggestion": "下一步建议（可选）"
}
```

成功生成：

```json
{
  "ok": true,
  "plan_id": "...",
  "snapshot_id": "...",
  "snapshot_version": 1,
  "plan_input_schema_version": "1.0",
  "plan": { }
}
```
