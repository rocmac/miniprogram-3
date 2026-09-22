const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const CONV = "yuanqi_conversations";
const CHAT = "ai_bot_chat_history_5hobd2b";
const DEFAULT_TITLE = "新会话";

const isCollectionMissing = (error) => {
  const code = error && (error.errCode || error.code);
  const msg = String((error && (error.errMsg || error.message)) || "");
  return (
    code === -502005 ||
    code === "DATABASE_COLLECTION_NOT_EXIST" ||
    msg.includes("COLLECTION_NOT_EXIST") ||
    msg.includes("Db or Table not exist")
  );
};

const convoDocId = (botId, userId, conversationId) =>
  `c_${botId}_${userId}_${conversationId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);

const ensureCollection = async (name) => {
  try {
    await db.createCollection(name);
  } catch (error) {
    if (!isCollectionMissing(error)) {
      // already exists
    }
  }
};

const withCol = async (name, handler) => {
  try {
    return await handler(db.collection(name));
  } catch (error) {
    if (!isCollectionMissing(error)) throw error;
    await ensureCollection(name);
    return handler(db.collection(name));
  }
};

const toIso = (ts) => {
  if (!ts) return new Date().toISOString();
  if (typeof ts === "number") return new Date(ts).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return String(ts);
};

const recordTime = (doc) => {
  const raw = doc && (doc.createdAt || doc.createTime);
  if (typeof raw === "number" && raw > 0) return raw;
  if (raw instanceof Date) return raw.getTime();
  const parsed = Date.parse(raw || "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortChatRows = (rows) => {
  return (rows || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = recordTime(a.item);
      const tb = recordTime(b.item);
      if (ta !== tb) return ta - tb;
      const roleA = a.item.role === "user" ? 0 : 1;
      const roleB = b.item.role === "user" ? 0 : 1;
      if (roleA !== roleB) return roleA - roleB;
      return a.index - b.index;
    })
    .map((row) => row.item);
};

const saveConversation = async (botId, userId, conversationId, title) => {
  const now = Date.now();
  const _id = convoDocId(botId, userId, conversationId);
  const nextTitle = (title && String(title).trim().slice(0, 100)) || DEFAULT_TITLE;
  return withCol(CONV, async (col) => {
    const existing = await col.doc(_id).get().catch(() => null);
    const doc = existing && existing.data;
    if (doc) {
      const patch = { updatedAt: now };
      if (nextTitle && nextTitle !== DEFAULT_TITLE) patch.title = nextTitle;
      await col.doc(_id).update({ data: patch });
      return {
        conversationId,
        title: patch.title || doc.title || DEFAULT_TITLE,
        createTime: toIso(doc.createdAt),
        updateTime: toIso(now),
      };
    }
    const data = {
      bot_id: botId,
      user_id: userId,
      conversation_id: conversationId,
      title: nextTitle,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await col.add({ data: { _id, ...data } });
    } catch (error) {
      await col.doc(_id).update({ data: { title: nextTitle, updatedAt: now } }).catch(() => {});
    }
    return {
      conversationId,
      title: nextTitle,
      createTime: toIso(now),
      updateTime: toIso(now),
    };
  });
};

const listConversations = async (botId, userId, pageNumber, pageSize) => {
  const limit = Math.max(1, Math.min(pageSize || 20, 100));
  const page = Math.max(1, pageNumber || 1);
  return withCol(CONV, async (col) => {
    const where = { bot_id: botId, user_id: userId };
    const [listRes, countRes] = await Promise.all([
      col.where(where).orderBy("updatedAt", "desc").skip((page - 1) * limit).limit(limit).get(),
      col.where(where).count(),
    ]);
    const data = (listRes.data || []).map((doc) => ({
      conversationId: doc.conversation_id,
      title: doc.title || DEFAULT_TITLE,
      createTime: toIso(doc.createdAt),
      updateTime: toIso(doc.updatedAt),
    }));
    return { data, total: (countRes && countRes.total) || data.length };
  });
};

const saveRecords = async (botId, userId, conversationId, records, title) => {
  await saveConversation(botId, userId, conversationId, title);
  const rows = (records || []).filter((item) => item && (item.content || item.recordId || item.record_id));
  for (let i = 0; i < rows.length; i += 1) {
    const item = rows[i];
    const recordId =
      item.recordId ||
      item.record_id ||
      `record-${Date.now().toString(16)}${i}${Math.random().toString(16).slice(2, 8)}`;
    const role = item.role === "user" || item.role === "human" ? "user" : "assistant";
    const createdAt =
      typeof item.createdAt === "number"
        ? item.createdAt
        : Date.parse(item.createTime || "") || Date.now() + i * 2 + (role === "user" ? 0 : 1);
    const data = {
      bot_id: botId,
      user_id: userId,
      conversation: conversationId,
      record_id: recordId,
      role,
      content: String(item.content || ""),
      type: item.type || "text",
      sender: userId,
      createdAt,
    };
    await withCol(CHAT, async (col) => {
      try {
        await col.doc(recordId).set({ data });
      } catch (error) {
        try {
          await col.add({ data: { _id: recordId, ...data } });
        } catch (addErr) {
          await col.where({ record_id: recordId, bot_id: botId }).update({ data }).catch(() => {});
        }
      }
    });
  }
  return { count: rows.length };
};

const listRecords = async (botId, userId, conversationId, pageNumber, pageSize) => {
  const limit = Math.max(1, Math.min(pageSize || 100, 100));
  const page = Math.max(1, pageNumber || 1);
  return withCol(CHAT, async (col) => {
    const where = { bot_id: botId, user_id: userId, conversation: conversationId };
    const [listRes, countRes] = await Promise.all([
      col.where(where).orderBy("createdAt", "asc").skip((page - 1) * limit).limit(limit).get(),
      col.where(where).count(),
    ]);
    const recordList = sortChatRows(listRes.data || []).map((doc) => ({
      botId: doc.bot_id,
      recordId: doc.record_id,
      role: doc.role,
      content: doc.content || "",
      conversation: doc.conversation,
      type: doc.type || "text",
      createTime: toIso(doc.createdAt),
    }));
    return { recordList, total: (countRes && countRes.total) || recordList.length };
  });
};

const deleteConversation = async (botId, userId, conversationId) => {
  const _id = convoDocId(botId, userId, conversationId);
  await withCol(CONV, async (col) => {
    try {
      await col.doc(_id).remove();
    } catch (error) {
      await col
        .where({ bot_id: botId, user_id: userId, conversation_id: conversationId })
        .remove();
    }
  });
  await withCol(CHAT, async (col) => {
    await col.where({ bot_id: botId, user_id: userId, conversation: conversationId }).remove();
  });
  return { count: 1 };
};

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  if (!userId) {
    return { success: false, error: "获取用户身份失败，请在小程序内调用" };
  }
  const action = event.action || "list";
  const botId = event.botId || "default";
  try {
    if (action === "list") {
      const data = await listConversations(botId, userId, event.pageNumber, event.pageSize);
      return { success: true, ...data };
    }
    if (action === "load") {
      if (!event.conversationId) return { success: false, error: "conversationId 不能为空" };
      const data = await listRecords(botId, userId, event.conversationId, event.pageNumber, event.pageSize);
      return { success: true, ...data };
    }
    if (action === "save") {
      if (!event.conversationId) return { success: false, error: "conversationId 不能为空" };
      const data = await saveRecords(
        botId,
        userId,
        event.conversationId,
        event.records || [],
        event.title,
      );
      return { success: true, ...data };
    }
    if (action === "delete") {
      if (!event.conversationId) return { success: false, error: "conversationId 不能为空" };
      const data = await deleteConversation(botId, userId, event.conversationId);
      return { success: true, ...data };
    }
    return { success: false, error: `unknown action ${action}` };
  } catch (error) {
    console.error("agentStore failed", action, error);
    return {
      success: false,
      error: (error && (error.message || error.errMsg)) || "存储失败",
    };
  }
};
