const userService = require("../../utils/user");

function hasRealName(name) {
  const text = String(name || "").trim();
  return !!text && text !== "微信用户";
}

Page({
  data: {
    nickName: "",
    avatarUrl: userService.DEFAULT_AVATAR,
    avatarFileID: "",
    accessStatus: "pending",
    profileReady: false,
    waiting: false,
    submitting: false,
    bannerTitle: "申请使用",
    bannerDesc: "请填写申请人姓名，并选择一张头像。管理员会根据这些信息决定是否允许使用。",
    submitText: "提交申请",
    needPrivacy: false,
  },

  onShow() {
    this.renderUser(userService.getLocalUser());
    this.refreshStatus();
    this.checkPrivacy();
  },

  checkPrivacy() {
    if (!wx.getPrivacySetting) return;
    wx.getPrivacySetting({
      success: (res) => {
        this.setData({ needPrivacy: !!(res && res.needAuthorization) });
      },
    });
  },

  onAgreePrivacy() {
    this.setData({ needPrivacy: false });
  },

  renderUser(user) {
    const info = user || {};
    const profileReady = !!info.profileReady;
    const accessStatus = info.accessStatus || "pending";
    const waiting = profileReady && accessStatus === "pending";
    const rejected = accessStatus === "rejected";
    this.setData({
      nickName: info.needProfile ? this.data.nickName : info.nickName || this.data.nickName || "",
      avatarUrl: userService.getDisplayAvatar(info),
      avatarFileID: info.avatarFileID || info.avatarUrl || "",
      accessStatus,
      profileReady,
      waiting,
      bannerTitle: rejected ? "暂时无法使用" : waiting ? "等待审核" : "申请使用",
      bannerDesc: rejected
        ? "管理员还未允许这个账号。你可以修改姓名或头像后重新提交。"
        : waiting
          ? "姓名和头像已提交。管理员通过后即可使用小程序。"
          : "请填写申请人姓名，并选择一张头像。管理员会根据这些信息决定是否允许使用。",
      submitText: rejected ? "重新提交" : waiting ? "更新资料" : "提交申请",
    });
  },

  async refreshStatus() {
    try {
      const user = await userService.loginUser({ action: "getProfile" });
      if (userService.canUseApp(user)) {
        wx.reLaunch({ url: "/pages/chatBot/chatBot" });
        return;
      }
      this.renderUser(user);
    } catch (err) {
      wx.showToast({ title: err.message || "获取状态失败", icon: "none" });
    }
  },

  onNicknameChange(e) {
    this.setData({ nickName: (e.detail && e.detail.value) || "" });
  },

  onNicknameBlur(e) {
    const nickName = String((e.detail && e.detail.value) || "").trim();
    if (nickName) this.setData({ nickName });
  },

  onPickAvatar() {
    wx.showToast({ title: "正在打开相册", icon: "none", duration: 1200 });
    const openAlbum = () => {
      const fail = (err) => {
        const msg = (err && err.errMsg) || "";
        if (msg.indexOf("cancel") !== -1) return;
        wx.showModal({
          title: "无法选择头像",
          content: msg || "微信没有打开选图窗口",
          showCancel: false,
        });
      };
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: (res) => {
            const file = res.tempFiles && res.tempFiles[0];
            this.saveAvatar(file && file.tempFilePath);
          },
          fail,
        });
        return;
      }
      wx.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: (res) => this.saveAvatar(res.tempFilePaths && res.tempFilePaths[0]),
        fail,
      });
    };
    if (!wx.requirePrivacyAuthorize) {
      openAlbum();
      return;
    }
    wx.requirePrivacyAuthorize({
      success: openAlbum,
      fail: openAlbum,
    });
  },

  onChooseAvatar(e) {
    const filePath = e.detail && e.detail.avatarUrl;
    if (!filePath) {
      wx.showToast({ title: "没有取到微信头像，请改用左侧相册", icon: "none" });
      return;
    }
    this.saveAvatar(filePath);
  },

  async saveAvatar(filePath) {
    if (!filePath) return;
    wx.showLoading({ title: "上传头像", mask: true });
    try {
      const openid = (userService.getLocalUser() && userService.getLocalUser().openid) || "anon";
      const upload = await wx.cloud.uploadFile({
        cloudPath: `user_avatars/${openid}/${Date.now()}.png`,
        filePath,
      });
      const user = await userService.updateProfile({
        avatarUrl: upload.fileID,
        avatarFileID: upload.fileID,
      });
      this.renderUser(user);
      this.setData({
        avatarUrl: upload.fileID,
        avatarFileID: upload.fileID,
      });
      wx.hideLoading();
      wx.showToast({ title: "头像已保存", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "头像保存失败", icon: "none" });
    }
  },

  async onSubmit() {
    const nickName = String(this.data.nickName || "").trim();
    if (!hasRealName(nickName)) {
      wx.showToast({ title: "请先填写申请人姓名", icon: "none" });
      return;
    }
    if (!this.data.avatarFileID) {
      wx.showToast({ title: "请先选择头像", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const user = await userService.applyAccess({
        nickName,
        avatarUrl: this.data.avatarFileID,
        avatarFileID: this.data.avatarFileID,
      });
      this.setData({ submitting: false });
      if (userService.canUseApp(user)) {
        wx.reLaunch({ url: "/pages/chatBot/chatBot" });
        return;
      }
      this.renderUser(user);
      wx.showToast({ title: "已提交，等待审核", icon: "success" });
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    }
  },
});
