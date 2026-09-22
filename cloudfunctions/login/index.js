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

const pickUser = (doc) => {
  if (!doc) return null;
  return {
    _id: doc._id,
    openid: doc.openid,
    unionid: doc.unionid || "",
    nickName: doc.nickName || DEFAULT_NICKNAME,
    avatarUrl: doc.avatarUrl || "",
    avatarFileID: doc.avatarFileID || "",
    phone: doc.phone || "",
    loginCount: doc.loginCount || 1,
    lastLoginAt: doc.lastLoginAt || doc.updatedAt || "",
    createdAt: doc.createdAt || "",
    updatedAt: doc.updatedAt || "",
    lastScene: doc.lastScene || "",
    platform: (doc.device && doc.device.platform) || "",
    needProfile: !doc.nickName || doc.nickName === DEFAULT_NICKNAME,
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
    const addResult = await withUsers((users) => users.add({ data: newUser }));
    return pickUser({ ...newUser, _id: addResult._id });
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

  await withUsers((users) => users.doc(existing._id).update({ data: updateData }));
  return pickUser({ ...existing, ...updateData });
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
