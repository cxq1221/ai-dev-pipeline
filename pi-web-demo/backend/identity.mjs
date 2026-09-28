import { createHash } from "node:crypto";

export const DEMO = Object.freeze({ appID: "vue-demo1", session: "demo", model: "deepseek-flash" });
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

export function validateIdentity(input) {
  const { appID, session, model } = input || {};
  if (typeof appID !== "string" || [...appID].length !== 9 || /\s|\p{C}/u.test(appID))
    throw invalid("appID 必须是恰好 9 位的字符串，不含空白或控制字符");
  if (typeof session !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(session))
    throw invalid("session 必须是 1–128 位字母、数字、下划线或连字符");
  if (typeof model !== "string" || !model)
    throw invalid("model 必填且必须是字符串");
  return { appID, session, model };
}

export function sessionId(identity) {
  return createHash("sha256").update(JSON.stringify([identity.appID, identity.session])).digest("hex");
}
