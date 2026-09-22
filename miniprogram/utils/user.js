const LOGIN_FN = "login";
const DEFAULT_AVATAR = "/components/agent-ui/imgs/wechat.svg";

function getAppSafe() {
  try {
    return getApp();
  } catch (e) {
    return null;
  }
}

function setLocalUser(user) {
  const app = getAppSafe();
  if (app) {
    app.globalData = app.globalData || {};
    app.globalData.userInfo = user;
  }
  try {
    wx.setStorageSync("userInfo", user || null);
  } catch (e) {}
}

function getLocalUser() {
  const app = getAppSafe();
  if (app && app.globalData && app.globalData.userInfo) {
    return app.globalData.userInfo;
  }
  try {
    return wx.getStorageSync("userInfo") || null;
  } catch (e) {
    return null;
  }
}

function getDeviceInfo() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    return {
      brand: info.brand || "",
      model: info.model || "",
      platform: info.platform || "",
      system: info.system || "",
    };
  } catch (e) {
    return {};
  }
}

function callLogin(data) {
  return wx.cloud
    .callFunction({
      name: LOGIN_FN,
      data: data || {},
    })
    .then((res) => {
      const result = (res && res.result) || {};
      if (!result.success) {
        throw new Error(result.error || "登录失败");
      }
      setLocalUser(result.data);
      return result.data;
    });
}

function loginUser(extra) {
  const payload = Object.assign({ action: "login" }, extra || {});
  if (!payload.device) payload.device = getDeviceInfo();
  return callLogin(payload);
}

function updateProfile(fields) {
  return callLogin(Object.assign({ action: "updateProfile" }, fields || {}));
}

function bindPhone(payload) {
  return callLogin(Object.assign({ action: "bindPhone" }, payload || {}));
}

function getDisplayAvatar(user) {
  if (user && (user.avatarFileID || user.avatarUrl)) {
    return user.avatarFileID || user.avatarUrl;
  }
  return DEFAULT_AVATAR;
}

module.exports = {
  DEFAULT_AVATAR,
  getLocalUser,
  setLocalUser,
  loginUser,
  updateProfile,
  bindPhone,
  getDisplayAvatar,
  getDeviceInfo,
};
