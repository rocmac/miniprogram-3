const userService = require("../../utils/user");

function formatTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function mapUser(item) {
  let statusText = "未填资料";
  let tagClass = "";
  if (item.isAdmin) {
    statusText = "管理员";
    tagClass = "admin";
  } else if (item.accessStatus === "approved") {
    statusText = "使用中";
    tagClass = "ok";
  } else if (item.accessStatus === "rejected") {
    statusText = "已停用";
  } else if (item.profileReady) {
    statusText = "待审核";
    tagClass = "pending";
  }
  const applied = formatTime(item.appliedAt);
  const created = formatTime(item.createdAt);
  return Object.assign({}, item, {
    avatar: userService.getDisplayAvatar(item),
    statusText,
    tagClass,
    timeText: applied ? `申请于 ${applied}` : created ? `打开于 ${created}` : "暂无时间",
  });
}

Page({
  data: {
    users: [],
    pendingCount: 0,
    loading: true,
  },

  onShow() {
    this.loadUsers();
  },

  onPullDownRefresh() {
    this.loadUsers().finally(() => wx.stopPullDownRefresh());
  },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const users = (await userService.listUsers()).map(mapUser);
      const pendingCount = users.filter((item) => !item.isAdmin && item.accessStatus === "pending" && item.profileReady).length;
      this.setData({ users, pendingCount, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  onAllow(e) {
    const userId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || "该用户";
    wx.showModal({
      title: "允许使用",
      content: `允许「${name}」使用小程序？`,
      success: (res) => {
        if (res.confirm) this.updateAccess(userId, "approved");
      },
    });
  },

  onDeny(e) {
    const userId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || "该用户";
    wx.showModal({
      title: "停用",
      content: `停用后「${name}」将不能继续使用小程序。`,
      success: (res) => {
        if (res.confirm) this.updateAccess(userId, "rejected");
      },
    });
  },

  async updateAccess(userId, accessStatus) {
    wx.showLoading({ title: "保存中", mask: true });
    try {
      await userService.setUserAccess(userId, accessStatus);
      wx.hideLoading();
      await this.loadUsers();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "保存失败", icon: "none" });
    }
  },
});
