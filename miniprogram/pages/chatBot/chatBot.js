// pages/chatBot/chatBot.js
Page({
  data: {
    chatMode: "bot",
    showBotAvatar: true,
    agentConfig: {
      // 控制台 AI → Agent 中 yuanqichat 的标识
      botId: "agt-yuanqichat-9gunopzt27fc7332",
      allowWebSearch: false,
      allowUploadFile: false,
      allowPullRefresh: true,
      allowUploadImage: false,
      showToolCallDetail: false,
      allowMultiConversation: true,
      allowVoice: false,
      showBotName: false,
      tools: [],
    },
    modelConfig: {
      modelProvider: "deepseek",
      quickResponseModel: "deepseek-v3.2",
      logo: "",
      welcomeMsg: "有什么可以帮你的吗？",
    },
    envShareConfig: {},
  },
  onShow() {
    if (wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: "#F7F7F8",
        backgroundColorTop: "#F7F7F8",
        backgroundColorBottom: "#F7F7F8",
      });
    }
    const agent = this.selectComponent("#agent");
    if (agent && typeof agent.syncUserInfo === "function") {
      agent.syncUserInfo();
    }
  },
  onShareAppMessage() {
    return {
      title: "彼安诺融合",
      path: "/pages/chatBot/chatBot",
      imageUrl: "/imgs/logo.png",
    };
  },
});
