const FN = "agentStore";

function callStore(data) {
  return wx.cloud
    .callFunction({
      name: FN,
      data: data || {},
    })
    .then((res) => (res && res.result) || {})
    .catch((err) => {
      console.log("[agentStore]", data && data.action, err);
      return { success: false, error: (err && err.errMsg) || "agentStore 调用失败" };
    });
}

export function cloudSaveChat({ botId, conversationId, title, records }) {
  if (!botId || !conversationId) return Promise.resolve({ success: false });
  return callStore({
    action: "save",
    botId,
    conversationId,
    title: title || "",
    records: (records || [])
      .filter((item) => item && item.content)
      .map((item) => ({
        recordId: item.recordId || item.record_id || "",
        role: item.role === "user" ? "user" : "assistant",
        content: item.content,
        type: item.type || "text",
        createTime: item.createTime || item.createdAt || "",
      })),
  });
}

export function cloudListConversations(botId, pageNumber, pageSize) {
  if (!botId) return Promise.resolve({ data: [], total: 0 });
  return callStore({
    action: "list",
    botId,
    pageNumber: pageNumber || 1,
    pageSize: pageSize || 20,
  }).then((res) => ({
    data: (res && res.data) || [],
    total: (res && res.total) || 0,
    success: Boolean(res && res.success),
  }));
}

export function cloudLoadRecords(botId, conversationId) {
  if (!botId || !conversationId) return Promise.resolve([]);
  return callStore({
    action: "load",
    botId,
    conversationId,
    pageNumber: 1,
    pageSize: 100,
  }).then((res) => (res && res.recordList) || []);
}

export function cloudDeleteConversation(botId, conversationId) {
  if (!botId || !conversationId) return Promise.resolve({ success: false });
  return callStore({
    action: "delete",
    botId,
    conversationId,
  });
}

export function cloudUpdateConversation({ botId, conversationId, title, pinned, pinnedAt }) {
  if (!botId || !conversationId) return Promise.resolve({ success: false });
  const data = {
    action: "update",
    botId,
    conversationId,
  };
  if (title != null) data.title = title;
  if (typeof pinned === "boolean") {
    data.pinned = pinned;
    data.pinnedAt = pinnedAt || Date.now();
  }
  return callStore(data);
}
