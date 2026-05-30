/** 纠错上一用户轮：若非 null，提交时需带 replace_user_message_id */
export let composerReplacementUserMessageId = null;
/** 进入纠错草稿前底部输入框中的内容（取消时还原） */
export let composerCorrectionBackfill = "";
/** 纠错草稿针对的会话；切换会话时自动放弃未发送的纠错 */
export let composerCorrectionThreadId = null;

/** @type {Record<string, unknown> | null} */
export let currentReportDetail = null;

/** @type {{ ok?: boolean, reasons?: string[], next_steps?: string[] } | null} */
export let lastPlanReportReadiness = null;

export function setCurrentReportDetail(v) {
  currentReportDetail = v;
}

export function setLastPlanReportReadiness(v) {
  lastPlanReportReadiness = v;
}

/** 跨模块写入须用 setter（静态 import 的绑定只读） */
export function setComposerReplacementUserMessageId(v) {
  composerReplacementUserMessageId = v;
}

export function setComposerCorrectionBackfill(v) {
  composerCorrectionBackfill = v;
}

export function setComposerCorrectionThreadId(v) {
  composerCorrectionThreadId = v;
}

export function resetComposerCorrectionDraftState() {
  composerReplacementUserMessageId = null;
  composerCorrectionBackfill = "";
  composerCorrectionThreadId = null;
}

export function getComposerReplacementUserMessageId() {
  return composerReplacementUserMessageId;
}
