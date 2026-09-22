// app.js
// cloudbase-agent 走 /acp。基础库 sendMessage 仍打 /send-message，该路径对本 Agent 返回 410。
if (typeof wx !== "undefined" && typeof wx.request === "function" && !wx.__yuanqiAcpPatched) {
  const origRequest = wx.request;
  const patched = function (options) {
    const url = options && options.url;
    if (typeof url === "string" && url.indexOf("/bots/agt-yuanqichat-9gunopzt27fc7332/send-message") !== -1) {
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
}

const userService = require("./utils/user");

App({
  globalData: {
    userInfo: null,
  },
  onLaunch: function (options) {
    const cached = userService.getLocalUser();
    if (cached) {
      this.globalData.userInfo = cached;
    }
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: "kinder-d3gvjqy8y58003361",
        traceUser: true,
      });
      this.silentLogin(options);
    }
  },
  silentLogin: function (options) {
    const scene = options && options.scene;
    return userService
      .loginUser({ scene })
      .then((user) => {
        console.log("[login] 已记录用户", user && user.openid, "count=", user && user.loginCount);
        return user;
      })
      .catch((err) => {
        console.log("[login] 记录用户失败", err);
      });
  },
});
