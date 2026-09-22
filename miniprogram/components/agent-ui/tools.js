export const checkConfig = (chatMode, agentConfig, modelConfig) => {
  const { botId } = agentConfig || {};
  const { modelProvider, quickResponseModel, deepReasoningModel } = modelConfig || {};
  // 检测不在微信环境，提示用户
  const appBaseInfo = wx.getAppBaseInfo();
  try {
    const systemInfo = wx.getSystemInfoSync();
    if (systemInfo.environment === "wxwork") {
      return [false, "请前往微信客户端扫码打开小程序"];
    }
  } catch (e) {
    if (appBaseInfo.host.env === "SDK") {
      return [false, "请前往微信客户端扫码打开小程序"];
    }
  }

  // 检测AI能力，不存在提示用户
  if (compareVersions(appBaseInfo.SDKVersion, "3.7.7") < 0) {
    return [false, "使用AI能力需基础库为3.7.7及以上，请升级基础库版本或微信客户端"];
  }
  if (!["bot",  "model"].includes(chatMode)) {
    return [false, "chatMode 不正确，值应为“bot”或“model”"];
  }
  if (chatMode === "bot" && !botId) {
    return [false, "当前chatMode值为bot，请配置botId"];
  }
  if (chatMode === "model" && (!modelProvider || !quickResponseModel)) {
    return [false, "当前chatMode值为model，请配置modelProvider和quickResponseModel"];
  }
  return [true, ""];
};
// 随机选取三个问题
export function randomSelectInitquestion(question = [], num = 3) {
  if (question.length <= num) {
    return [...question];
  }
  const set = new Set();
  while (set.size < num) {
    const randomIndex = Math.floor(Math.random() * question.length);
    set.add(question[randomIndex]);
  }
  return Array.from(set);
}

export const getCloudInstance = (function () {
  let cloudInstance = null;
  return async function (envShareConfig) {
    if (cloudInstance) {
      return cloudInstance;
    }
    // 如果开启了环境共享，走环境共享的ai实例
    if (envShareConfig && envShareConfig.resourceAppid && envShareConfig.resourceEnv) {
      let instance = new wx.cloud.Cloud({
        // 资源方 AppID
        resourceAppid: envShareConfig.resourceAppid,
        // 资源方环境 ID
        resourceEnv: envShareConfig.resourceEnv,
      });
      await instance.init();
      // 烦，环境共享时创建实例，没有把环境id挂在instance上，这里手动挂上去，如果你发现instance上有个env，那么这个insatnce就是环境共享的云开发实例
      instance.env = envShareConfig.resourceEnv;
      cloudInstance = instance;
      return cloudInstance;
    } else {
      cloudInstance = wx.cloud;
      return cloudInstance;
    }
  };
})();

export const compareVersions = (version1, version2) => {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);
  const maxLength = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < maxLength; i++) {
    const num1 = v1Parts[i] || 0;
    const num2 = v2Parts[i] || 0;

    if (num1 > num2) {
      return 1;
    } else if (num1 < num2) {
      return -1;
    }
  }
  return 0;
};

let isDomainWarn = false;
const FALLBACK_ENV_ID = "kinder-d3gvjqy8y58003361";
const ACP_BOT_ID = "agt-yuanqichat-9gunopzt27fc7332";
const SERVICE_NAME = "yuanqichat";
const ACP_STREAM_URL = "https://yuanqichat-4359034-1479023451.ap-shanghai.run.tcloudbase.com/acp";

export const isLocalConversationId = (id) => {
  return typeof id === "string" && /^conversation-[0-9a-f]+$/i.test(id);
};

export const makeCloudConversationId = () => {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < 10; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (!/[g-z]/.test(id)) {
    id = `${id.slice(0, 9)}g`;
  }
  return `conversation-${id}`;
};

export const installAcpGatewayPatch = () => {
  if (typeof wx === "undefined" || typeof wx.request !== "function" || wx.__yuanqiAcpPatched) {
    return;
  }
  const origRequest = wx.request;
  const patched = function (options) {
    const url = options && options.url;
    if (typeof url === "string" && url.indexOf(`/bots/${ACP_BOT_ID}/send-message`) !== -1) {
      const next = Object.assign({}, options, {
        url: url.replace(/\/send-message\b/, "/acp"),
      });
      console.log("[yuanqichat] rewrite send-message -> acp", next.url);
      return origRequest.call(this, next);
    }
    return origRequest.apply(this, arguments);
  };
  try {
    wx.request = patched;
    if (wx.request === patched) {
      wx.__yuanqiAcpPatched = true;
    } else {
      console.log("[yuanqichat] wx.request 不可改写，将走 callContainer /acp");
    }
  } catch (e) {
    console.log("[yuanqichat] patch wx.request failed", e);
  }
};

installAcpGatewayPatch();

const getAiBot = (cloudInstance) => {
  return cloudInstance && cloudInstance.extend && cloudInstance.extend.AI && cloudInstance.extend.AI.bot;
};

const getEnvId = (cloudInstance) => {
  const bot = getAiBot(cloudInstance);
  return (
    (cloudInstance && cloudInstance.env) ||
    (bot && bot.context && bot.context.env) ||
    FALLBACK_ENV_ID
  );
};

const getAiBotToken = async (cloudInstance) => {
  const bot = getAiBot(cloudInstance);
  if (!bot) return null;
  const manager = bot.tokenManager || bot._tokenManager;
  if (!manager || typeof manager.getToken !== "function") {
    return null;
  }
  try {
    const res = await manager.getToken();
    if (!res) return null;
    if (typeof res === "string") return res;
    return res.token || res.accessToken || res.access_token || null;
  } catch (e) {
    console.log("[yuanqichat] getToken failed", e);
    return null;
  }
};

const parseJsonLike = (value) => {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return value;
    }
  }
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, "").trim())
    .filter((line) => line && line !== "[DONE]");
  if (!dataLines.length) return value;
  const payload = dataLines[dataLines.length - 1];
  try {
    return JSON.parse(payload);
  } catch (e) {
    return value;
  }
};

const gatewayWxRequest = async (options, self, token, envId) => {
  return wx.request({
    ...options,
    path: undefined,
    url: `https://${envId}.api.tcloudbasegateway.com/v1/aibot/${options.path}`,
    header: {
      ...options.header,
      Authorization: `Bearer ${token}`,
    },
    fail: (e) => {
      if (options.fail) {
        options.fail.bind(self)(e);
        const errMsg = (e && e.errMsg) || "";
        if (e.errno === 600002 || errMsg.includes("url not in domain list")) {
          const msg = `请前往微信公众平台 request 合法域名配置中添加云开发域名 https://${envId}.api.tcloudbasegateway.com`;
          if (!isDomainWarn) {
            isDomainWarn = true;
            wx.showModal({
              title: "提示",
              content: msg,
              complete: () => {
                isDomainWarn = false;
              },
            });
          }
        }
      }
    },
  });
};

export const commonRequest = async (options) => {
  const cloudInstance = await getCloudInstance();
  const self = this;
  const { forceGateway, ...requestOptions } = options || {};
  const ai = cloudInstance.extend && cloudInstance.extend.AI;

  // 会话 CRUD 必须拿 JSON。ai.request 会按 Bot SSE 解析，conversationId 会被剥掉。
  if (forceGateway) {
    const token = await getAiBotToken(cloudInstance);
    if (token) {
      console.log("走wx request", requestOptions.method, requestOptions.path, "forceGateway=true");
      return gatewayWxRequest(requestOptions, self, token, getEnvId(cloudInstance));
    }
    console.log("[yuanqichat] forceGateway 无 token，回退 ai.request", requestOptions.method, requestOptions.path);
  }

  // 优先 ai.request：云开发会自动带登录态，当前基础库没有 tokenManager
  if (ai && typeof ai.request === "function") {
    console.log("[yuanqichat] ai.request", requestOptions.method, requestOptions.path);
    return ai.request(requestOptions);
  }

  const token = await getAiBotToken(cloudInstance);
  if (!token) {
    throw new Error("云开发 AI 鉴权不可用：当前基础库没有 tokenManager，请使用 3.8.1 以上基础库");
  }
  console.log("走wx request", requestOptions.method, requestOptions.path, "forceGateway=", !!forceGateway);
  return gatewayWxRequest(requestOptions, self, token, getEnvId(cloudInstance));
};

export const unwrapAiResponse = (res) => {
  if (res == null) return res;
  if (typeof res === "string") {
    return parseJsonLike(res);
  }
  if (typeof res === "object" && typeof res.statusCode === "number" && res.data !== undefined) {
    return unwrapAiResponse(res.data);
  }
  if (typeof res === "object" && typeof res.data === "string") {
    const parsed = parseJsonLike(res.data);
    if (parsed !== res.data) return parsed;
  }
  return res;
};

export const makeConversationId = () => makeCloudConversationId();

const copyBytes = (data) => {
  if (data == null) return null;
  if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
    return new Uint8Array(data.slice(0));
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return null;
};

const stringAsLatin1Bytes = (str) => {
  if (!str) return new Uint8Array(0);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code > 255) return null;
    bytes[i] = code;
  }
  return bytes;
};

const utf8IncompleteTail = (bytes) => {
  if (!bytes || !bytes.length) return 0;
  const len = bytes.length;
  const maxLook = Math.min(4, len);
  for (let n = 1; n <= maxLook; n += 1) {
    const b = bytes[len - n];
    if ((b & 0x80) === 0) return 0;
    if ((b & 0xe0) === 0xc0) return n < 2 ? n : 0;
    if ((b & 0xf0) === 0xe0) return n < 3 ? n : 0;
    if ((b & 0xf8) === 0xf0) return n < 4 ? n : 0;
    if ((b & 0xc0) !== 0x80) return 0;
  }
  return 0;
};

const bytesToUtf8 = (bytes) => {
  if (!bytes || !bytes.length) return "";
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  let binary = "";
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  try {
    return decodeURIComponent(escape(binary));
  } catch (e) {
    return binary;
  }
};

const concatBytes = (left, right) => {
  if (!left || !left.length) return right || new Uint8Array(0);
  if (!right || !right.length) return left;
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
};

const chunkToBytes = (data) => {
  if (data == null) return null;
  if (typeof data === "string") {
    const latin1 = stringAsLatin1Bytes(data);
    if (latin1) return latin1;
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(data);
    }
    return null;
  }
  return copyBytes(data);
};

const findSseBoundary = (bytes) => {
  if (!bytes || bytes.length < 2) return null;
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] === 13 && i + 3 < bytes.length && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
      return { index: i, width: 4 };
    }
    if (bytes[i] === 10 && bytes[i + 1] === 10) {
      return { index: i, width: 2 };
    }
  }
  return null;
};

const createUtf8StreamDecoder = () => {
  let pending = new Uint8Array(0);

  const decodeBytesFallback = (incoming, stream) => {
    const merged = concatBytes(pending, incoming);
    if (!stream) {
      pending = new Uint8Array(0);
      return bytesToUtf8(merged);
    }
    const tail = utf8IncompleteTail(merged);
    if (tail) {
      pending = merged.slice(merged.length - tail);
      return bytesToUtf8(merged.subarray(0, merged.length - tail));
    }
    pending = new Uint8Array(0);
    return bytesToUtf8(merged);
  };

  return {
    decode(data) {
      if (data == null) return "";
      const incoming = chunkToBytes(data);
      if (!incoming) {
        return typeof data === "string" ? data : "";
      }
      return decodeBytesFallback(incoming, true);
    },
    flush() {
      return decodeBytesFallback(new Uint8Array(0), false);
    },
  };
};

const extractChunkText = (chunk) => {
  if (chunk == null || chunk === "[DONE]") {
    return { text: "", error: "" };
  }
  if (typeof ArrayBuffer !== "undefined" && (chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk))) {
    try {
      return extractChunkText(bytesToUtf8(copyBytes(chunk) || new Uint8Array()));
    } catch (e) {
      return { text: "", error: "" };
    }
  }
  if (typeof chunk === "string") {
    const parsed = parseJsonLike(chunk);
    if (parsed !== chunk && parsed && typeof parsed === "object") {
      return extractChunkText(parsed);
    }
    return { text: chunk, error: "" };
  }
  if (typeof chunk !== "object") {
    return { text: String(chunk), error: "" };
  }
  if (chunk.json && typeof chunk.json === "object") {
    return extractChunkText(chunk.json);
  }
  if (chunk.data != null && chunk.data !== chunk) {
    return extractChunkText(chunk.data);
  }
  const payload = chunk;
  if (payload.type === "error" || payload.status === "error" || payload.errCode || payload.code === -1) {
    const error =
      (payload.error && (payload.error.message || payload.error.msg)) ||
      payload.message ||
      payload.msg ||
      payload.content ||
      formatCloudError(payload);
    return { text: "", error: error || "Agent 返回错误" };
  }
  if (payload.type === "TEXT_MESSAGE_CONTENT") {
    return { text: payload.delta || payload.content || "", error: "" };
  }
  if (payload.type === "text" || payload.content != null || payload.delta != null || payload.text != null) {
    const text = payload.delta || payload.content || payload.text || "";
    return { text: typeof text === "string" ? text : "", error: "" };
  }
  return { text: "", error: "" };
};

export const consumeTextishStream = async (stream, label) => {
  const result = { text: "", error: "", chunkCount: 0, raw: [] };
  if (!stream) {
    return result;
  }
  const decoder = createUtf8StreamDecoder();
  let index = 0;
  try {
    for await (const chunk of stream) {
      const normalized =
        typeof ArrayBuffer !== "undefined" && (chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk))
          ? decoder.decode(chunk)
          : chunk;
      if (index < 8) {
        result.raw.push(normalized);
        console.log(`[yuanqichat] ${label || "stream"}`, index, normalized);
      }
      index += 1;
      const extracted = extractChunkText(normalized);
      if (extracted.error) {
        result.error = extracted.error;
      }
      if (extracted.text) {
        result.text += extracted.text;
      }
    }
    const tail = decoder.flush();
    if (tail) {
      const extracted = extractChunkText(tail);
      if (extracted.text) {
        result.text += extracted.text;
      }
    }
  } catch (e) {
    console.log(`[yuanqichat] ${label || "stream"} failed`, e);
    if (!result.error) {
      result.error = formatCloudError(e);
    }
  }
  result.chunkCount = index;
  return result;
};

export const readBotReply = async (res) => {
  const keys = res && typeof res === "object" ? Object.keys(res) : [];
  console.log("[yuanqichat] sendMessage res keys", keys);
  const acp = await parseAcpStream(res);
  if (acp.text || acp.error || acp.sessionId || acp.result) {
    return acp;
  }
  let collected = await consumeTextishStream(res && res.textStream, "textStream");
  if (!collected.text && !collected.error) {
    const fromEvent = await consumeTextishStream(res && res.eventStream, "eventStream");
    if (fromEvent.text || fromEvent.error || fromEvent.chunkCount) {
      collected = fromEvent;
    }
  }
  collected.resKeys = keys;
  return collected;
};

const parseAcpFrame = (event) => {
  if (!event) return null;
  if (event.data === "[DONE]") return { done: true };
  let frame = event.json;
  if (frame == null && event.data != null) {
    if (event.data === "[DONE]") return { done: true };
    frame = typeof event.data === "string" ? parseJsonLike(event.data) : event.data;
  }
  if (frame && typeof frame === "object") {
    return { frame };
  }
  return null;
};

const appendAcpRecord = (out, role, piece, messageId) => {
  if (!role || !piece) {
    return;
  }
  if (!Array.isArray(out.records)) {
    out.records = [];
  }
  const last = out.records[out.records.length - 1];
  const sameMessage = last && last.role === role && (messageId ? last.messageId === messageId : !last.messageId);
  if (sameMessage) {
    last.content += piece;
    return;
  }
  out.records.push({
    role,
    content: piece,
    messageId: messageId || "",
    record_id: messageId || `record_id_${out.records.length}_${Date.now()}`,
    hiddenBtnGround: true,
  });
};

const applyAcpFrame = (out, frame, onText) => {
  if (!frame || typeof frame !== "object") {
    return;
  }
  if (!Array.isArray(out.records)) {
    out.records = [];
  }
  if (out.raw.length < 8) {
    out.raw.push(frame);
    console.log("[yuanqichat] acp frame", out.raw.length - 1, frame);
  }
  if (frame.error) {
    out.error = (frame.error && (frame.error.message || frame.error.msg)) || JSON.stringify(frame.error);
  }
  if (frame.result) {
    out.result = frame.result;
    out.sessionId =
      frame.result.sessionId ||
      frame.result.conversationId ||
      (frame.result.session && (frame.result.session.sessionId || frame.result.session.conversationId)) ||
      out.sessionId;
  }
  const params = frame.params || {};
  if (params.sessionId) {
    out.sessionId = params.sessionId;
  }
  if (params.conversationId) {
    out.sessionId = params.conversationId;
  }
  const update = params.update || {};
  const sessionUpdate = update.sessionUpdate || "";
  const content = update.content || {};
  let piece = typeof content === "string" ? content : content.text || update.text || "";
  const messageId = update.messageId || update.message_id || "";
  if (sessionUpdate === "user_message_chunk" || sessionUpdate === "user_message") {
    appendAcpRecord(out, "user", piece, messageId);
  }
  if (sessionUpdate === "agent_message") {
    if (piece && piece !== out.text) {
      out.replaceText = true;
      out.text = piece;
      const last = out.records[out.records.length - 1];
      if (last && last.role === "assistant") {
        last.content = piece;
      } else {
        appendAcpRecord(out, "assistant", piece, messageId);
      }
      if (onText) onText(out.text);
    }
    return;
  }
  if (sessionUpdate === "agent_message_chunk") {
    if (!piece || piece === out.text) {
      return;
    }
    if (out.text && piece.startsWith(out.text)) {
      piece = piece.slice(out.text.length);
      if (!piece) return;
    }
    appendAcpRecord(out, "assistant", piece, messageId);
    out.text += piece;
    if (onText) onText(out.text);
  }
};

export const parseAcpSseText = (raw, onText) => {
  const out = { text: "", sessionId: "", result: null, error: "", chunkCount: 0, raw: [], records: [], replaceText: false };
  if (raw == null) {
    return out;
  }
  if (typeof ArrayBuffer !== "undefined" && (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw))) {
    try {
      return parseAcpSseText(bytesToUtf8(copyBytes(raw) || new Uint8Array()), onText);
    } catch (e) {
      return out;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    applyAcpFrame(out, raw, onText);
    if (raw.data && typeof raw.data === "object") {
      applyAcpFrame(out, raw.data, onText);
    }
    if (typeof raw.data === "string") {
      return parseAcpSseText(raw.data, onText);
    }
    out.chunkCount = Math.max(out.chunkCount, 1);
    return out;
  }
  const text = String(raw);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (!line) continue;
    if (line.indexOf("data:") === 0) {
      line = line.slice(5).trim();
    } else {
      line = line.trim();
    }
    if (!line || line === "[DONE]") continue;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch (e) {
      continue;
    }
    out.chunkCount += 1;
    applyAcpFrame(out, frame, onText);
  }
  return out;
};

const collectedLooksUseful = (collected) => {
  return !!(
    collected &&
    (collected.text ||
      collected.sessionId ||
      collected.result ||
      collected.error ||
      (collected.records && collected.records.length) ||
      (collected.chunkCount && collected.chunkCount > 0))
  );
};

const mergeCollected = (out, extra) => {
  if (!out || !extra) {
    return out;
  }
  if (extra.replaceText) {
    out.text = extra.text || "";
  } else if (extra.text) {
    out.text += extra.text;
  }
  if (extra.sessionId) {
    out.sessionId = extra.sessionId;
  }
  if (extra.result) {
    out.result = extra.result;
  }
  if (extra.error && !out.error) {
    out.error = extra.error;
  }
  if (extra.chunkCount) {
    out.chunkCount += extra.chunkCount;
  }
  if (extra.replaceText) {
    const last = (out.records || []).filter((item) => item && item.role === "assistant").pop();
    if (last) {
      last.content = out.text;
    } else if (extra.records && extra.records.length) {
      out.records = extra.records;
    }
  } else if (extra.records && extra.records.length) {
    out.records = (out.records || []).concat(extra.records);
  }
  if (extra.raw && extra.raw.length) {
    out.raw = (out.raw || []).concat(extra.raw).slice(0, 8);
  }
  return out;
};

export const parseAcpStream = async (res, onText) => {
  const out = {
    text: "",
    sessionId: "",
    result: null,
    error: "",
    chunkCount: 0,
    raw: [],
    records: [],
    resKeys: res && typeof res === "object" ? Object.keys(res) : [],
  };
  if (!res) {
    return out;
  }

  const consumeStream = async (stream) => {
    if (!stream) {
      return;
    }
    const decoder = createUtf8StreamDecoder();
    try {
      for await (const event of stream) {
        out.chunkCount += 1;
        if (typeof event === "string" || (typeof ArrayBuffer !== "undefined" && (event instanceof ArrayBuffer || ArrayBuffer.isView(event)))) {
          const text = typeof event === "string" ? event : decoder.decode(event);
          mergeCollected(out, parseAcpSseText(text, onText));
          continue;
        }
        const parsed = parseAcpFrame(event);
        if (parsed && parsed.done) {
          break;
        }
        if (parsed && parsed.frame) {
          applyAcpFrame(out, parsed.frame, onText);
          continue;
        }
        mergeCollected(out, parseAcpSseText(event, onText));
      }
      const tail = decoder.flush();
      if (tail) {
        mergeCollected(out, parseAcpSseText(tail, onText));
      }
    } catch (e) {
      console.log("[yuanqichat] acp stream failed", e);
      if (!out.error) {
        out.error = formatCloudError(e);
      }
    }
  };

  await consumeStream(res.eventStream);
  if (!collectedLooksUseful(out)) {
    await consumeStream(res.textStream);
  }
  if (!collectedLooksUseful(out) && res.data != null) {
    mergeCollected(out, parseAcpSseText(res.data, onText));
  }
  return out;
};

const callContainerAcp = (path, payload) => {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callContainer !== "function") {
      reject(new Error("当前基础库不支持 callContainer"));
      return;
    }
    wx.cloud.callContainer({
      config: { env: FALLBACK_ENV_ID },
      path,
      method: "POST",
      header: {
        "X-WX-SERVICE": SERVICE_NAME,
        "content-type": "application/json",
        accept: "text/event-stream, application/json",
      },
      data: payload,
      timeout: 300000,
      success: (res) => resolve(res),
      fail: (err) => reject(err),
    });
  });
};

const streamAcpPrompt = (payload, onText) => {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.request !== "function") {
      reject(new Error("wx.request 不可用"));
      return;
    }
    const out = {
      text: "",
      sessionId: "",
      result: null,
      error: "",
      chunkCount: 0,
      raw: [],
      records: [],
      resKeys: ["stream"],
    };
    let pending = new Uint8Array(0);
    const consumeBytes = (data) => {
      const incoming = chunkToBytes(data);
      if (!incoming || !incoming.length) return;
      pending = concatBytes(pending, incoming);
      let bound = findSseBoundary(pending);
      while (bound) {
        const eventBytes = pending.subarray(0, bound.index);
        pending = pending.slice(bound.index + bound.width);
        const text = bytesToUtf8(eventBytes).replace(/\r\n/g, "\n");
        if (text) {
          mergeCollected(out, parseAcpSseText(text));
          if (onText) onText(out.text);
        }
        bound = findSseBoundary(pending);
      }
    };
    const finishBuffer = () => {
      if (pending.length) {
        mergeCollected(out, parseAcpSseText(bytesToUtf8(pending)));
        if (onText) onText(out.text);
        pending = new Uint8Array(0);
      }
    };
    const reqTask = wx.request({
      url: ACP_STREAM_URL,
      method: "POST",
      enableChunked: true,
      responseType: "arraybuffer",
      timeout: 300000,
      header: {
        "content-type": "application/json",
        accept: "text/event-stream, application/json",
      },
      data: payload,
      success: (res) => {
        finishBuffer();
        if (collectedLooksUseful(out) || out.chunkCount > 0) {
          resolve(out);
          return;
        }
        if (res && res.data != null) {
          mergeCollected(out, parseAcpSseText(res.data, onText));
        }
        if (collectedLooksUseful(out) || out.chunkCount > 0) {
          resolve(out);
          return;
        }
        reject(new Error(`流式 ACP 无内容 HTTP ${res && res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
    if (reqTask && typeof reqTask.onChunkReceived === "function") {
      reqTask.onChunkReceived((res) => {
        consumeBytes(res && res.data);
      });
    }
  });
};

export const acpSend = async (ai, botId, method, params, onText) => {
  installAcpGatewayPatch();
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params: params || {},
  };
  console.log("[yuanqichat] acp", method, payload);

  const finish = (collected) => {
    if (!Array.isArray(collected.records)) {
      collected.records = [];
    }
    if (!collected.records.length) {
      const fromResult = extractRecordList(collected.result) || extractRecordList(collected);
      if (fromResult.length) {
        collected.records = normalizeAcpRecords(fromResult);
      }
    } else {
      collected.records = normalizeAcpRecords(collected.records);
    }
    collected.usedConversationId =
      collected.sessionId || (params && (params.sessionId || params.conversationId)) || "";
    console.log("[yuanqichat] acp result", method, {
      sessionId: collected.sessionId,
      chunkCount: collected.chunkCount,
      hasText: !!collected.text,
      recordCount: collected.records.length,
      error: collected.error,
      result: collected.result,
    });
    return collected;
  };

  let lastErr = "";

  if (method === "session/prompt") {
    try {
      const streamed = await streamAcpPrompt(payload, onText);
      if (collectedLooksUseful(streamed) || streamed.chunkCount > 0) {
        return finish(streamed);
      }
      lastErr = "流式 ACP 为空";
    } catch (e) {
      lastErr = formatCloudError(e);
      console.log("[yuanqichat] stream acp failed", lastErr);
    }
  }

  // 先走 SDK 流式：app.js 已把本 Agent 的 /send-message 改写成 /acp
  try {
    const data = { botId, ...payload };
    const res = await ai.bot.sendMessage({ data });
    const collected = await parseAcpStream(res, onText);
    if (collectedLooksUseful(collected) || collected.chunkCount > 0) {
      return finish(collected);
    }
    lastErr = "网关 ACP 流为空";
  } catch (e) {
    lastErr = formatCloudError(e);
    console.log("[yuanqichat] sendMessage acp failed", lastErr);
  }

  // yuanqichat 是云托管/Agent，不是云函数；根路径 / 会 404。只再试 /acp。
  try {
    const res = await callContainerAcp("/acp", payload);
    console.log("[yuanqichat] callContainer /acp", res && res.statusCode);
    if (res && res.statusCode && res.statusCode >= 400) {
      lastErr = `callContainer /acp HTTP ${res.statusCode}`;
    } else {
      const collected = parseAcpSseText(res && (res.data != null ? res.data : res), onText);
      collected.resKeys = res && typeof res === "object" ? Object.keys(res) : [];
      if (collectedLooksUseful(collected)) {
        return finish(collected);
      }
      lastErr = "callContainer /acp 无 ACP 内容";
    }
  } catch (e) {
    lastErr = formatCloudError(e);
    console.log("[yuanqichat] callContainer /acp failed", lastErr);
  }

  return finish({
    text: "",
    sessionId: "",
    result: null,
    error:
      lastErr ||
      "ACP 无内容。yuanqichat 应走 /acp，不要走 /send-message。请确认云托管服务名是 yuanqichat 且已部署。",
    chunkCount: 0,
    raw: [],
    records: [],
    resKeys: [],
  });
};

export const extractConversationFromAny = async (res) => {
  let conv = extractConversation(res) || extractConversation(res && res.data);
  if (conv) return conv;
  const stream = res && (res.textStream || res.eventStream);
  if (!stream) return null;
  const collected = await consumeTextishStream(stream, "createConversation stream");
  const parsed = parseJsonLike(collected.text);
  conv = extractConversation(parsed) || extractConversation({ data: parsed });
  if (conv) return conv;
  for (const item of collected.raw) {
    conv = extractConversation(item) || extractConversation(parseJsonLike(item));
    if (conv) return conv;
  }
  return null;
};

export const isConversationSdkUnsupported = (e) => {
  const msg = formatCloudError(e);
  return /createConversation|getConversation|deleteConversation|基础库不支持|请升级到\s*3\.7/.test(msg);
};

export const aiBotRequest = (options) => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn) => (val) => {
      if (settled) return;
      settled = true;
      fn(val);
    };
    const onSuccess = done((res) => {
      if (res && typeof res.statusCode === "number" && res.statusCode >= 400) {
        reject(unwrapAiResponse(res) || res);
        return;
      }
      resolve(unwrapAiResponse(res));
    });
    const ret = commonRequest({
      ...options,
      header: {
        "content-type": "application/json",
        ...(options.header || {}),
      },
      success: onSuccess,
      fail: done(reject),
    });
    if (ret && typeof ret.then === "function") {
      ret.then(onSuccess).catch(done(reject));
    }
  });
};

export const aiBotJsonRequest = (options) => {
  return aiBotRequest({
    ...options,
    forceGateway: true,
    header: {
      accept: "application/json",
      ...(options.header || {}),
    },
  });
};

export const sleep = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
};

export const formatCloudError = (e) => {
  if (e == null) {
    return "未知错误";
  }
  if (typeof e === "string") {
    return e;
  }
  const parts = [];
  if (e.errMsg) parts.push(e.errMsg);
  if (e.message && e.message !== e.errMsg) parts.push(e.message);
  if (e.errCode != null) parts.push(`errCode=${e.errCode}`);
  if (e.code != null && e.code !== e.errCode) parts.push(`code=${e.code}`);
  try {
    const raw = JSON.stringify(e);
    if (raw && raw !== "{}" && parts.join(" | ").indexOf(raw) === -1) {
      parts.push(raw);
    }
  } catch (err) {}
  return parts.join(" | ") || String(e);
};

const DEFAULT_AVATAR = "./imgs/logo.png";
const DISPLAY_BOT_NAME = "彼安诺融合";
const DISPLAY_WELCOME_MESSAGE = "你好，我是彼安诺，有什么想聊的";

export const buildFallbackBot = (botId, extra = {}) => {
  return {
    botId,
    name: DISPLAY_BOT_NAME,
    avatar: extra.avatar || DEFAULT_AVATAR,
    welcomeMessage: DISPLAY_WELCOME_MESSAGE,
    initQuestions: [],
    multiConversationEnable: !!extra.multiConversationEnable,
    isNeedRecommend: extra.isNeedRecommend !== undefined ? extra.isNeedRecommend : true,
  };
};

export const normalizeBot = (bot, botId) => {
  const fallback = buildFallbackBot(botId, bot || {});
  return {
    ...fallback,
    ...(bot || {}),
    botId: (bot && bot.botId) || botId,
    name: DISPLAY_BOT_NAME,
    avatar: (bot && bot.avatar) || DEFAULT_AVATAR,
    welcomeMessage: DISPLAY_WELCOME_MESSAGE,
    initQuestions: [],
  };
};

export const extractConversationList = (res) => {
  if (!res) return [];
  const candidates = [
    res.data,
    res.conversationList,
    res.list,
    res.conversations,
    res.sessions,
    res.result,
    res.result && res.result.data,
    res.result && res.result.conversationList,
    res.result && res.result.sessions,
    res.data && res.data.data,
    res.data && res.data.conversationList,
    res.data && res.data.list,
    res.data && res.data.conversations,
    res.data && res.data.sessions,
  ];
  let items = [];
  for (const item of candidates) {
    if (Array.isArray(item)) {
      items = item;
      break;
    }
  }
  return items
    .map((src) => {
      if (!src || typeof src !== "object") return null;
      const conversationId =
        src.conversationId || src.conversation_id || src.sessionId || src.session_id || "";
      if (!conversationId) return null;
      return {
        conversationId,
        title: src.title || "新会话",
        createTime: src.createTime || src.createdAt,
        updateTime: src.updateTime || src.updatedAt,
      };
    })
    .filter(Boolean);
};

export const extractConversation = (res) => {
  if (!res) return null;
  let payload = res;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      return null;
    }
  }
  const candidates = [
    payload,
    payload.data,
    payload.result,
    payload.conversation,
    payload.data && payload.data.data,
    payload.data && payload.data.conversation,
    payload.result && payload.result.conversation,
  ];
  for (const src of candidates) {
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const conversationId =
      src.conversationId ||
      src.conversation_id ||
      src.sessionId ||
      src.session_id ||
      (typeof src.id === "string" && /conversation|conv-/i.test(src.id) ? src.id : "");
    if (!conversationId) continue;
    return {
      conversationId,
      title: src.title || "新会话",
      createTime: src.createTime || src.createdAt,
      updateTime: src.updateTime || src.updatedAt,
    };
  }
  return null;
};

export const extractRecordList = (res) => {
  if (!res) return [];
  const candidates = [
    res.recordList,
    res.records,
    res.messages,
    res.history,
    res.data && res.data.recordList,
    res.data && res.data.records,
    res.data && res.data.messages,
    res.data && res.data.history,
    Array.isArray(res.data) ? res.data : null,
    res.result && res.result.recordList,
    res.result && res.result.records,
    res.result && res.result.messages,
    res.result && res.result.history,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    if (Array.isArray(candidates[i]) && candidates[i].length) {
      return candidates[i];
    }
  }
  return [];
};

export const normalizeAcpRecords = (list) => {
  return (list || [])
    .map((item, index) => {
      if (!item) return null;
      if (typeof item === "string") {
        return {
          role: "assistant",
          content: item,
          record_id: `record_id_${index}`,
          hiddenBtnGround: true,
        };
      }
      const roleRaw = item.role || item.sender || "";
      const role = roleRaw === "user" || roleRaw === "human" || roleRaw === "USER" ? "user" : "assistant";
      let content = item.content;
      if (content && typeof content === "object") {
        content = content.text || content.content || "";
      }
      if (content == null) {
        content = item.text || item.msg || "";
      }
      if (typeof content !== "string") {
        content = "";
      }
      if (!content) {
        return null;
      }
      return {
        role,
        content,
        messageId: item.messageId || item.message_id || "",
        record_id: item.recordId || item.record_id || item.messageId || item.id || `record_id_${index}`,
        createTime: item.createTime || item.createdAt || "",
        hiddenBtnGround: true,
      };
    })
    .filter(Boolean);
};

export const isAgentV2Id = (botId = "") => {
  // 仅 agent- 前缀走 AG-UI。agt-yuanqichat 使用 msg + conversationId
  return botId.startsWith("agent-") || botId.startsWith("agent");
};

export const isFullAgentId = (botId = "") => {
  return /^(agt-|agent-|bot-|ibot-)/.test(botId);
};

export const resolveBotId = async (ai, configuredId) => {
  if (isFullAgentId(configuredId)) {
    return configuredId;
  }
  if (!ai || !ai.bot || typeof ai.bot.list !== "function") {
    return configuredId;
  }
  try {
    const res = await ai.bot.list({ pageNumber: 1, pageSize: 50 });
    const botList = (res && (res.botList || (res.data && res.data.botList))) || [];
    if (!botList.length) {
      return configuredId;
    }
    const exactId = botList.find((item) => item.botId === configuredId);
    if (exactId) {
      return exactId.botId;
    }
    const exactName = botList.find((item) => item.name === configuredId);
    if (exactName) {
      return exactName.botId;
    }
    const prefixHit = botList.find(
      (item) =>
        (item.botId && item.botId.startsWith(`${configuredId}-`)) ||
        (item.botId && item.botId.startsWith(`ibot-${configuredId}`)) ||
        (item.botId && item.botId.startsWith(`agt-${configuredId}`))
    );
    if (prefixHit) {
      return prefixHit.botId;
    }
  } catch (e) {
    console.log("resolveBotId failed", e);
  }
  return configuredId;
};
