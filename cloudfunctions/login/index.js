const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION = "users";
const DEFAULT_NICKNAME = "微信用户";

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

const ensureCollection = async () => {
  try {
    await db.createCollection(COLLECTION);
  } catch (error) {
    if (!isCollectionMissing(error)) {
      // 集合已存在时 createCollection 会失败，可忽略
    }
  }
};

const withUsers = async (handler) => {
  try {
    return await handler(db.collection(COLLECTION));
  } catch (error) {
    if (!isCollectionMissing(error)) {
      throw error;
    }
    await ensureCollection();
    return handler(db.collection(COLLECTION));
  }
};

const toIso = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const isProfileReady = (doc) => {
  if (!doc) return false;
  const name = String(doc.nickName || "").trim();
  const avatar = doc.avatarFileID || doc.avatarUrl || "";
  return !!(name && name !== DEFAULT_NICKNAME && avatar);
};

const pickUser = (doc) => {
  if (!doc) return null;
  const isAdmin = !!doc.isAdmin;
  const accessStatus = isAdmin
    ? "approved"
    : doc.accessStatus === "approved" || doc.accessStatus === "rejected"
      ? doc.accessStatus
      : "pending";
  return {
    _id: doc._id,
    openid: doc.openid,
    unionid: doc.unionid || "",
    nickName: doc.nickName || DEFAULT_NICKNAME,
    avatarUrl: doc.avatarUrl || "",
    avatarFileID: doc.avatarFileID || "",
    phone: doc.phone || "",
    loginCount: doc.loginCount || 1,
    lastLoginAt: toIso(doc.lastLoginAt || doc.updatedAt),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    appliedAt: toIso(doc.appliedAt),
    lastScene: doc.lastScene || "",
    platform: (doc.device && doc.device.platform) || "",
    needProfile: !isProfileReady(doc),
    profileReady: isProfileReady(doc),
    isAdmin,
    accessStatus,
  };
};

const pickAdminUser = (doc) => {
  const user = pickUser(doc);
  if (!user) return null;
  return {
    _id: user._id,
    nickName: user.nickName,
    avatarUrl: user.avatarUrl,
    avatarFileID: user.avatarFileID,
    isAdmin: user.isAdmin,
    accessStatus: user.accessStatus,
    profileReady: user.profileReady,
    loginCount: user.loginCount,
    createdAt: user.createdAt,
    appliedAt: user.appliedAt,
    lastLoginAt: user.lastLoginAt,
  };
};

const findUser = async (openid) => {
  return withUsers(async (users) => {
    const result = await users.where({ openid }).limit(1).get();
    const list = (result && result.data) || [];
    return list[0] || null;
  });
};

const login = async (event, wxContext) => {
  const openid = wxContext.OPENID;
  const unionid = wxContext.UNIONID || "";
  const now = new Date();
  const existing = await findUser(openid);
  const nickName = (event.nickName && String(event.nickName).trim()) || "";
  const avatarUrl = event.avatarUrl || "";
  const avatarFileID = event.avatarFileID || "";
  const device = event.device && typeof event.device === "object" ? event.device : {};
  const lastScene = event.scene != null ? String(event.scene) : "";

  if (!existing) {
    const newUser = {
      openid,
      unionid,
      nickName: nickName || DEFAULT_NICKNAME,
      avatarUrl,
      avatarFileID,
      phone: "",
      isAdmin: false,
      accessStatus: "pending",
      loginCount: 1,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
      lastScene,
      device: {
        brand: device.brand || "",
        model: device.model || "",
        platform: device.platform || "",
        system: device.system || "",
      },
    };
    await withUsers((users) => users.add({ data: newUser }));
    return pickUser(await findUser(openid));
  }

  const updateData = {
    unionid: unionid || existing.unionid || "",
    loginCount: (existing.loginCount || 0) + 1,
    lastLoginAt: now,
    updatedAt: now,
    lastScene: lastScene || existing.lastScene || "",
    device: {
      brand: device.brand || (existing.device && existing.device.brand) || "",
      model: device.model || (existing.device && existing.device.model) || "",
      platform: device.platform || (existing.device && existing.device.platform) || "",
      system: device.system || (existing.device && existing.device.system) || "",
    },
  };
  if (nickName) updateData.nickName = nickName;
  if (avatarUrl) updateData.avatarUrl = avatarUrl;
  if (avatarFileID) updateData.avatarFileID = avatarFileID;
  if (!existing.isAdmin && !existing.accessStatus) updateData.accessStatus = "pending";

  await withUsers((users) => users.doc(existing._id).update({ data: updateData }));
  return pickUser(await findUser(openid));
};

const updateProfile = async (event, wxContext) => {
  const existing = await findUser(wxContext.OPENID);
  if (!existing) {
    return login(event, wxContext);
  }
  const updateData = { updatedAt: new Date() };
  if (event.nickName != null) {
    const nickName = String(event.nickName).trim();
    if (nickName) updateData.nickName = nickName.slice(0, 20);
  }
  if (event.avatarUrl != null) updateData.avatarUrl = event.avatarUrl;
  if (event.avatarFileID != null) updateData.avatarFileID = event.avatarFileID;
  await withUsers((users) => users.doc(existing._id).update({ data: updateData }));
  return pickUser({ ...existing, ...updateData });
};

const applyAccess = async (event, wxContext) => {
  let existing = await findUser(wxContext.OPENID);
  if (!existing) {
    await login(event, wxContext);
    existing = await findUser(wxContext.OPENID);
  }
  const nickName =
    event.nickName != null ? String(event.nickName).trim().slice(0, 20) : String(existing.nickName || "").trim();
  const updateData = { updatedAt: new Date() };
  if (nickName) updateData.nickName = nickName;
  if (event.avatarFileID) {
    updateData.avatarFileID = event.avatarFileID;
    updateData.avatarUrl = event.avatarUrl || event.avatarFileID;
  } else if (event.avatarUrl) {
    updateData.avatarUrl = event.avatarUrl;
  }
  const merged = { ...existing, ...updateData };
  if (!isProfileReady(merged)) {
    throw new Error("请先选择头像并填写申请人姓名");
  }
  if (!merged.isAdmin && merged.accessStatus !== "approved") {
    updateData.accessStatus = "pending";
    updateData.appliedAt = new Date();
  }
  await withUsers((users) => users.doc(existing._id).update({ data: updateData }));
  return pickUser({ ...existing, ...updateData });
};

const requireAdmin = async (wxContext) => {
  const me = await findUser(wxContext.OPENID);
  if (!me || !me.isAdmin) {
    throw new Error("没有管理权限");
  }
  return me;
};

const listUsers = async (wxContext) => {
  const me = await requireAdmin(wxContext);
  const listed = await withUsers((users) => users.limit(100).get());
  const rows = ((listed && listed.data) || []).map(pickAdminUser).sort((a, b) => {
    const rank = (item) => {
      if (item.isAdmin) return 4;
      if (item.accessStatus === "pending" && item.profileReady) return 0;
      if (item.accessStatus === "pending") return 1;
      if (item.accessStatus === "rejected") return 2;
      return 3;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return new Date(b.appliedAt || b.createdAt || 0) - new Date(a.appliedAt || a.createdAt || 0);
  });
  return { me: pickUser(me), users: rows };
};

const setUserAccess = async (event, wxContext) => {
  const me = await requireAdmin(wxContext);
  const userId = String(event.userId || "");
  const accessStatus = event.accessStatus === "approved" || event.accessStatus === "rejected" ? event.accessStatus : "";
  if (!userId || !accessStatus) {
    throw new Error("参数不正确");
  }
  let target = null;
  try {
    const targetRes = await withUsers((users) => users.doc(userId).get());
    target = targetRes && targetRes.data;
  } catch (error) {
    target = null;
  }
  if (!target) throw new Error("找不到该用户");
  if (target.isAdmin || target.openid === me.openid) {
    throw new Error("不能修改管理员的使用权限");
  }
  await withUsers((users) =>
    users.doc(userId).update({
      data: {
        accessStatus,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    })
  );
  return pickUser(me);
};

const bindPhone = async (event, wxContext) => {
  let phone = "";
  if (event.cloudID) {
    const openData = await cloud.getOpenData({
      list: [event.cloudID],
    });
    const first = openData && openData.list && openData.list[0];
    const data = first && first.data;
    phone = (data && (data.purePhoneNumber || data.phoneNumber)) || "";
  }
  if (!phone && event.code && cloud.openapi && cloud.openapi.phonenumber) {
    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
      code: event.code,
    });
    const info = (phoneRes && phoneRes.phoneInfo) || phoneRes || {};
    phone = info.purePhoneNumber || info.phoneNumber || "";
  }
  if (!phone) {
    throw new Error("未能获取手机号，请确认小程序已开通该权限");
  }
  const existing = await findUser(wxContext.OPENID);
  if (!existing) {
    const created = await login(event, wxContext);
    await withUsers((users) =>
      users.doc(created._id).update({
        data: { phone, updatedAt: new Date() },
      })
    );
    return pickUser({ ...created, phone });
  }
  await withUsers((users) =>
    users.doc(existing._id).update({
      data: { phone, updatedAt: new Date() },
    })
  );
  return pickUser({ ...existing, phone, updatedAt: new Date() });
};

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    return { success: false, error: "获取用户身份失败，请在小程序内调用" };
  }

  try {
    const action = event.action || "login";
    let data;
    if (action === "getProfile") {
      data = pickUser(await findUser(wxContext.OPENID));
      if (!data) data = await login(event, wxContext);
    } else if (action === "updateProfile") {
      data = await updateProfile(event, wxContext);
    } else if (action === "apply") {
      data = await applyAccess(event, wxContext);
    } else if (action === "listUsers") {
      const listed = await listUsers(wxContext);
      return { success: true, data: listed.me, users: listed.users };
    } else if (action === "setUserAccess") {
      data = await setUserAccess(event, wxContext);
    } else if (action === "bindPhone") {
      data = await bindPhone(event, wxContext);
    } else {
      data = await login(event, wxContext);
    }
    return { success: true, data };
  } catch (error) {
    console.error("login failed", error);
    return {
      success: false,
      error: (error && (error.message || error.errMsg)) || "登录失败，请重试",
    };
  }
};
