const userService = require("../../utils/user");

function maskId(value) {
  const text = String(value || "");
  if (!text) return "未获取";
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function formatTime(value) {
  if (!value) return "暂无";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    userInfo: {},
    nickName: "",
    avatarUrl: userService.DEFAULT_AVATAR,
    maskedOpenid: "未获取",
    maskedUnionid: "",
    lastLoginText: "暂无",
    createdAtText: "暂无",
    deviceText: "暂无",
    accessText: "等待审核",
  },

  onShow() {
    this.renderUser(userService.getLocalUser());
    this.refreshProfile();
  },

  renderUser(user) {
    const info = user || {};
    this.setData({
      userInfo: info,
      nickName: info.needProfile ? "" : info.nickName || "",
      avatarUrl: userService.getDisplayAvatar(info),
      maskedOpenid: maskId(info.openid),
      maskedUnionid: maskId(info.unionid),
      lastLoginText: formatTime(info.lastLoginAt),
      createdAtText: formatTime(info.createdAt),
      deviceText: [info.platform, info.model].filter(Boolean).join(" · ") || "暂无",
      accessText: info.isAdmin
        ? "管理员"
        : info.accessStatus === "approved"
          ? "已允许使用"
          : info.accessStatus === "rejected"
            ? "未通过"
            : "等待审核",
    });
  },

  goAdmin() {
    wx.navigateTo({ url: "/pages/admin/admin" });
  },

  async refreshProfile() {
    try {
      const user = await userService.loginUser({ action: "getProfile" });
      this.renderUser(user);
    } catch (e) {
      if (!this.data.userInfo.openid) {
        wx.showToast({ title: e.message || "获取用户信息失败", icon: "none" });
      }
    }
  },

  onNicknameChange(e) {
    this.setData({ nickName: (e.detail && e.detail.value) || "" });
  },

  async onNicknameBlur(e) {
    const nickName = String((e.detail && e.detail.value) || this.data.nickName || "").trim();
    if (!nickName || nickName === this.data.userInfo.nickName) return;
    wx.showLoading({ title: "保存中", mask: true });
    try {
      const user = await userService.updateProfile({ nickName });
      wx.hideLoading();
      this.renderUser(user);
      wx.showToast({ title: "昵称已保存", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "保存失败", icon: "none" });
    }
  },

  async onChooseAvatar(e) {
    const filePath = e.detail && e.detail.avatarUrl;
    if (!filePath) return;
    wx.showLoading({ title: "上传头像", mask: true });
    try {
      const openid = (this.data.userInfo && this.data.userInfo.openid) || "anon";
      const upload = await wx.cloud.uploadFile({
        cloudPath: `user_avatars/${openid}/${Date.now()}.png`,
        filePath,
      });
      const user = await userService.updateProfile({
        avatarUrl: upload.fileID,
        avatarFileID: upload.fileID,
      });
      wx.hideLoading();
      this.renderUser(user);
      wx.showToast({ title: "头像已保存", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "头像保存失败", icon: "none" });
    }
  },
});
