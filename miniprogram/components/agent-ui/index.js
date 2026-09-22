// components/agent-ui/index.js
import { checkConfig, randomSelectInitquestion, getCloudInstance, commonRequest, sleep, normalizeBot, isAgentV2Id, formatCloudError, extractConversationList, extractConversation, extractRecordList, aiBotRequest, aiBotJsonRequest, isConversationSdkUnsupported, extractConversationFromAny, readBotReply, makeConversationId, makeCloudConversationId, acpSend, isLocalConversationId, normalizeAcpRecords } from "./tools";
import { cloudSaveChat, cloudListConversations, cloudLoadRecords, cloudDeleteConversation } from "./agent-store";
import md5 from "./md5.js";
Component({
  properties: {
    chatMode: {
      type: String,
      value: "",
    },
    envShareConfig: {
      type: Object,
      value: {},
    },
    showBotAvatar: {
      type: Boolean,
      value: false,
    },
    presentationMode: {
      type: String,
      value: "",
    },
    agentConfig: {
      type: Object,
      value: {
        botId: "",
        allowUploadFile: true,
        allowWebSearch: true,
        allowPullRefresh: true,
        allowUploadImage: true,
        allowMultiConversation: true,
        allowVoice: true,
        showToolCallDetail: true,
        showBotName: true,
        tools: [],
      },
    },
    modelConfig: {
      type: Object,
      value: {
        modelProvider: "",
        quickResponseModel: "",
        logo: "",
        welcomeMsg: "",
      },
    },
  },

  observers: {
    showWebSearchSwitch: function (showWebSearchSwitch) {
      this.setData({
        showFeatureList: showWebSearchSwitch,
      });
    },
    // 监听agentConfig变化，判断是否是agent-开头的
    agentConfig: function (agentConfig) {
      if (this.properties.chatMode === "bot" && isAgentV2Id(agentConfig.botId)) {
        this.setData({
          isAgent: true,
          agentV2Config: {
            agentID: agentConfig.botId,
            tools: agentConfig.tools,
          },
        });
      }
    },
  },

  data: {
    isAgent: false,
    agentV2Config: {
      agentID: "",
      tools: [],
    },
    showMenu: false,
    tapMenuRecordId: "",
    isLoading: true, // 判断是否尚在加载中
    article: {},
    windowInfo: wx.getWindowInfo(),
    bot: {},
    inputValue: "",
    output: "",
    chatRecords: [],
    setPanelVisibility: false,
    questions: [],
    scrollTop: 0, // 文字撑起来后能滚动的最大高度
    viewTop: 0, // 根据实际情况，可能用户手动滚动，需要记录当前滚动的位置
    scrollTo: "", // 快速定位到指定元素，置底用
    scrollTimer: null, //
    manualScroll: false, // 当前为手动滚动/自动滚动
    showTools: false, // 展示底部工具栏
    showFileList: false, // 展示输入框顶部文件行
    showTopBar: false, // 展示顶部bar
    sendFileList: [],
    lastScrollTop: 0,
    showUploadFile: true,
    showUploadImg: true,
    showWebSearchSwitch: false,
    showPullRefresh: true,
    canPullHistory: false,
    showToolCallDetail: true,
    showMultiConversation: true,
    showBotName: true,
    showVoice: true,
    useWebSearch: false,
    showFeatureList: false,
    chatStatus: 0, // 页面状态： 0-正常状态，可输入，可发送， 1-发送中 2-思考中 3-输出content中
    triggered: false,
    page: 1,
    size: 10,
    total: 0,
    refreshText: "下拉加载历史记录",
    shouldAddScrollTop: false,
    isShowFeedback: false,
    feedbackRecordId: "",
    feedbackType: "",
    textareaHeight: 50,
    defaultErrorMsg: "网络繁忙，请稍后重试!",
    curScrollHeight: 0,
    isDrawerShow: false,
    conversations: [],
    transformConversations: {},
    conversationPageOptions: {
      page: 1,
      size: 15,
      total: 0,
    },
    conversation: null,
    userAvatar: "/components/agent-ui/imgs/wechat.svg",
    userName: "微信用户",
    userHint: "查看登录信息",
    defaultConversation: null, // 旧结构默认会话
    fetchConversationLoading: false,
    audioContext: {}, // 只存储当前正在使用的音频context playStatus 状态 0 默认待播放 1 解析中 2 播放中
    audioSrcMap: {}, // 下载过的音频 src 缓存
    useVoice: false,
    startY: 0, // 触摸起点Y坐标
    longPressTriggered: false, // 长按是否触发
    sendStatus: 0, // 0 默认态 （还未触发长按） 1 待发送态 （触发长按，待发送） 2 待取消态 （触发长按，但超出阈值）3 发送 4 取消
    moveThreshold: 50, // 滑动阈值（单位：px）
    longPressTimer: null, // 长按定时器
    recorderManager: null,
    recordOptions: {
      duration: 60000, // 最长60s
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 192000,
      format: "aac",
      frameSize: 50,
    },
    voiceRecognizing: false,
    speedList: [2, 1.5, 1.25, 1, 0.75],

    showActionMenu: false, // 是否显示操作菜单
    selectedConversation: null, // 当前选中的会话

    messages: [], // 消息列表
    threadId: "",
    keyboardHeight: 0, // iOS 键盘弹出后需手动垫高，避免输入栏与键盘之间露出黑边
  },
  attached: async function () {
    this.syncUserInfo();
    this.initKeyboardInset();
    const chatMode = this.data.chatMode;
    // 检查配置
    const [check, message] = checkConfig(chatMode, this.data.agentConfig, this.data.modelConfig);
    if (!check) {
      wx.showModal({
        title: "提示",
        content: message,
      });
      return;
    }
    // 初始化一次cloudInstance，它是单例的，后面不传参数也可以获取到
    const cloudInstance = await getCloudInstance(this.data.envShareConfig);
    // 配置型 Agent 初始化
    if (chatMode === "bot") {
      const { botId: configuredBotId } = this.data.agentConfig;
      if (isAgentV2Id(configuredBotId)) {
        const bot = normalizeBot({ name: "彼安诺融合", multiConversationEnable: true }, configuredBotId);
        const questions = randomSelectInitquestion(bot.initQuestions, 3);
        this.setData({
          isAgent: true,
          bot,
          questions,
          showWebSearchSwitch: false,
          showUploadFile: false,
          showUploadImg: false,
          showPullRefresh: false,
          showToolCallDetail: this.data.agentConfig.showToolCallDetail !== false,
          showMultiConversation: true,
          showVoice: false,
          showBotName: false,
          agentV2Config: {
            agentID: configuredBotId,
            tools: this.data.agentConfig.tools || [],
          },
          threadId: this.data.threadId || "threadId_" + Date.now(),
        });
        return;
      }
      const ai = cloudInstance.extend.AI;
      console.log("[yuanqichat] ai.bot methods", ai.bot && Object.keys(ai.bot));
      // 小程序只对接 yuanqichat，不要解析/覆盖成 yuanqi-agent
      const botId = configuredBotId;
      let botRes;
      try {
        botRes = await ai.bot.get({ botId });
      } catch (e) {
        botRes = { code: -1, message: (e && e.message) || "获取 Agent 失败" };
      }
      const bot = (!botRes || botRes.code) ? normalizeBot(null, botId) : normalizeBot(botRes, botId);
      bot.botId = botId;
      bot.multiConversationEnable = true;
      bot.isNeedRecommend = false;
      if (botRes && botRes.code) {
        console.log("ai.bot.get fallback", botRes);
      }
      console.log("[yuanqichat] init classic", { configuredBotId, returnedBotId: botRes && botRes.botId, botId: bot.botId });

      // 初始化第一条记录为welcomeMessage
      const record = {
        content: bot.welcomeMessage || "你好，我是彼安诺，有什么想聊的",
        record_id: "record_id" + String(+new Date() + 10),
        role: "assistant",
        hiddenBtnGround: true,
      };
      const { chatRecords } = this.data;
      // 随机选取三个初始化问题
      const questions = randomSelectInitquestion(bot.initQuestions, 3);
      let {
        allowWebSearch,
        allowUploadFile,
        allowPullRefresh,
        allowUploadImage,
        showToolCallDetail,
        allowMultiConversation,
        allowVoice,
        showBotName,
      } = this.data.agentConfig;
      allowWebSearch = allowWebSearch === undefined ? true : allowWebSearch;
      allowUploadFile = allowUploadFile === undefined ? true : allowUploadFile;
      allowPullRefresh = allowPullRefresh === undefined ? true : allowPullRefresh;
      allowUploadImage = allowUploadImage === undefined ? true : allowUploadImage;
      showToolCallDetail = showToolCallDetail === undefined ? true : showToolCallDetail;
      allowMultiConversation = allowMultiConversation === undefined ? true : allowMultiConversation;
      allowVoice = allowVoice === undefined ? true : allowVoice;
      showBotName = showBotName === undefined ? true : showBotName;
      this.setData({
        bot,
        questions,
        chatRecords: chatRecords.length > 0 ? chatRecords : [record],
        showWebSearchSwitch: allowWebSearch,
        showUploadFile: allowUploadFile,
        showUploadImg: allowUploadImage,
        showPullRefresh: allowPullRefresh,
        showToolCallDetail: showToolCallDetail,
        showMultiConversation: true,
        showVoice: allowVoice,
        showBotName: showBotName,
        isAgent: false,
      });
      await this.resetFetchConversationList();
      if (this.data.bot.voiceSettings?.enable) {
        // 初始化录音管理器
        await this.initRecordManager();
        // 提前获取语音权限
        wx.getSetting({
          success(res) {
            if (!res.authSetting["scope.record"]) {
              wx.authorize({
                scope: "scope.record",
                success() { },
                fail() {
                  // 用户拒绝授权，可以引导用户到设置页面手动开启权限
                  wx.openSetting({
                    success(res) {
                      if (res.authSetting["scope.record"]) {
                        // 用户手动开启权限，可以进行录音操作
                      }
                    },
                  });
                },
              });
            }
          },
        });
      }
    }
  },
  detached: function () {
    if (wx.offKeyboardHeightChange && this._onKeyboardHeightChange) {
      wx.offKeyboardHeightChange(this._onKeyboardHeightChange);
    }
    this._onKeyboardHeightChange = null;
    if (this._keyboardBlurTimer) {
      clearTimeout(this._keyboardBlurTimer);
      this._keyboardBlurTimer = null;
    }
    // 在组件实例被从页面节点树移除时执行，释放当前的音频资源
    const context = this.data.audioContext.context;
    if (context) {
      context.stop();
      context.destroy();
    }
  },
  methods: {
    initRecordManager: async function () {
      const cloudInstance = await getCloudInstance();
      const recorderManager = wx.getRecorderManager();
      recorderManager.onStart(() => {
        console.log("recorder start");
      });
      recorderManager.onPause(() => {
        console.log("recorder pause");
      });
      recorderManager.onStop((res) => {
        console.log("停止录音");
        console.log("this.data.sendStatus", this.data.sendStatus);
        if (this.data.sendStatus === 3) {
          console.log("确认发送");
          console.log("recorder stop", res);
          const { tempFilePath } = res;
          console.log("tempFilePath", tempFilePath);
          // const tempFileInfo = tempFilePath.split(".")
          const fileName = md5(tempFilePath) + ".aac";
          console.log("fileName", fileName);
          if (fileName) {
            new Promise((resolve, reject) => {
              // 上传至云存储换取 cloudId
              cloudInstance.uploadFile({
                cloudPath: `agent_file/${this.data.bot.botId}/${fileName}`, // 云上文件路径
                filePath: tempFilePath,
                success: async (res) => {
                  console.log("uploadFile res", res);
                  const fileId = res.fileID;
                  cloudInstance.getTempFileURL({
                    fileList: [fileId], // 文件唯一标识符 cloudID, 可通过上传文件接口获取
                    success: (res) => {
                      console.log("getTempFileURL", res);
                      const { fileList } = res;
                      if (fileList && fileList.length) {
                        // 调用语音转文本接口获取文本
                        console.log("开始转文字");
                        commonRequest({
                          path: `bots/${this.data.bot.botId}/speech-to-text`,
                          data: {
                            url: fileList[0].tempFileURL,
                            engSerViceType: this.data.bot.voiceSettings?.inputType,
                            voiceFormat: "aac",
                          }, //
                          method: "POST",
                          timeout: 60000,
                          success: (res) => {
                            console.log("speech-to-text res", res);
                            const { data } = res;
                            if (data && data.Result) {
                              this.sendMessage(data.Result);
                              resolve(data.Result);
                            } else {
                              resolve();
                            }
                          },
                          fail: (e) => {
                            console.log("e", e);
                            reject(e);
                          },
                          complete: () => { },
                          header: {},
                        });
                      }
                    },
                    fail: (e) => {
                      reject(e);
                    },
                  });
                },
                fail: (err) => {
                  console.error("上传失败：", err);
                  reject(err);
                },
              });
            }).finally(() => {
              this.setData({
                sendStatus: 0,
                voiceRecognizing: false,
                longPressTriggered: false,
              });
            });
          }
        } else {
          this.setData({
            sendStatus: 0,
            longPressTriggered: false,
          });
        }
        // console.log('this.data.sendStatus', this.data.sendStatus)
      });
      recorderManager.onError((err) => {
        console.log("recorder err", err);
        this.setData({
          sendStatus: 0,
        });
      });
      this.setData({
        recorderManager: recorderManager,
      });
    },
    handleChangeInputType(e) {
      // 检查当前语音能力权限
      if (!this.data.bot.voiceSettings?.enable) {
        wx.showModal({
          title: "提示",
          content: "请前往腾讯云开发平台启用语音输入输出能力",
        });
        return;
      }
      this.setData({
        useVoice: !this.data.useVoice,
      });
    },
    handleCopyAll(e) {
      const { content } = e.currentTarget.dataset;
      wx.setClipboardData({
        data: content,
        success: () => {
          wx.showToast({
            title: "复制成功",
            icon: "success",
          });
          this.hideMenu();
        },
      });
    },
    handleEdit(e) {
      const { content } = e.currentTarget.dataset;
      this.setData({
        inputValue: content,
      });
      this.hideMenu();
    },
    handleLongPress(e) {
      const { id } = e.currentTarget.dataset;
      this.setData({
        showMenu: true,
        tapMenuRecordId: id,
      });
    },
    hideMenu() {
      this.setData({
        showMenu: false,
        tapMenuRecordId: "",
      });
    },
    // 点击页面其他地方隐藏菜单
    onTapPage() {
      if (this.data.showMenu) {
        this.hideMenu();
      }
    },
    transformToolName: function (str) {
      if (str) {
        const strArr = str.split(/\/+/);
        return strArr[strArr.length - 1];
      }
      return "";
    },
    makeWelcomeRecord: function () {
      const { bot } = this.data;
      const recordId = "record_id" + String(+new Date() + 10);
      return {
        content: (bot && bot.welcomeMessage) || "你好，我是彼安诺，有什么想聊的",
        record_id: recordId,
        role: "assistant",
        hiddenBtnGround: true,
        createTime: Date.now(),
        renderKey: `assistant_${recordId}`,
      };
    },
    isWelcomeRecord: function (item) {
      if (!item || item.role !== "assistant") {
        return false;
      }
      const welcome = (this.data.bot && this.data.bot.welcomeMessage) || "";
      if (!item.content) {
        return !!item.hiddenBtnGround;
      }
      return !!(welcome && item.content === welcome);
    },
    sanitizeChatRecords: function (list, fromCloud) {
      const source = fromCloud ? normalizeAcpRecords(list) : list || [];
      return this.sortChatRecords(
        source.filter((item) => item && item.content && !this.isWelcomeRecord(item)),
      );
    },
    parseRecordTime: function (item) {
      if (!item) return 0;
      const raw = item.createTime || item.createdAt || item.time;
      if (typeof raw === "number" && raw > 0) return raw;
      if (raw) {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return 0;
    },
    sortChatRecords: function (list) {
      return (list || [])
        .map((item, index) => ({ item, index, t: this.parseRecordTime(item) }))
        .sort((a, b) => {
          if (a.t && b.t && a.t !== b.t) return a.t - b.t;
          if (a.t && b.t && a.t === b.t) {
            if (a.item.role === "user" && b.item.role !== "user") return -1;
            if (a.item.role !== "user" && b.item.role === "user") return 1;
          }
          if (a.t && !b.t) return -1;
          if (!a.t && b.t) return 1;
          return a.index - b.index;
        })
        .map((row) => row.item);
    },
    finalizeChatRecords: function (list) {
      const next = this.sortChatRecords(list || []).map((item, index) => {
        const recordId = item.record_id || item.recordId || `record_${index}`;
        return Object.assign({}, item, {
          record_id: recordId,
          renderKey: `${item.role || "msg"}_${recordId}_${index}`,
        });
      });
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === "assistant") {
          next[i].hiddenBtnGround = false;
          break;
        }
      }
      return next;
    },
    countUserMessages: function (list) {
      return (list || []).filter((item) => item && item.role === "user").length;
    },
    pickBestChatRecords: function (candidates) {
      let best = [];
      let bestUser = -1;
      let bestLen = -1;
      (candidates || []).forEach((list) => {
        const records = this.sanitizeChatRecords(list);
        const userCount = this.countUserMessages(records);
        if (userCount > bestUser || (userCount === bestUser && records.length > bestLen)) {
          best = records;
          bestUser = userCount;
          bestLen = records.length;
        }
      });
      return best;
    },
    showChatRecords: function (conversationId, list) {
      const records = this.finalizeChatRecords(this.sanitizeChatRecords(list));
      if (!records.length) {
        this.setData({
          chatRecords: [this.makeWelcomeRecord()],
          questions: [],
          chatStatus: 0,
          total: 0,
        });
        return false;
      }
      this.setData({
        chatRecords: records,
        questions: [],
        chatStatus: 0,
        total: records.length,
      });
      if (conversationId) {
        this.writeLocalChatRecords(conversationId, records);
      }
      this.autoToBottom();
      return true;
    },
    handleClickConversation: async function (e) {
      const { conversation } = e.currentTarget.dataset;
      this.persistCurrentChat();
      this.setData({
        isDrawerShow: false,
        conversation: {
          conversationId: conversation.conversationId,
          title: conversation.title,
          fromServer: !isLocalConversationId(conversation.conversationId),
        },
        canPullHistory: true,
        page: 1,
        size: 10,
      });
      await this.loadConversationHistory(conversation.conversationId, { allowCloud: true, useInMemory: false });
    },
    loadConversationHistory: async function (conversationId, options = {}) {
      const allowCloud = options.allowCloud !== false;
      const useInMemory = options.useInMemory !== false;
      const token = (this._historyLoadToken = (this._historyLoadToken || 0) + 1);
      if (!conversationId) {
        this.showChatRecords("", []);
        return;
      }
      const currentId = this.data.conversation && this.data.conversation.conversationId;
      const inMemory = useInMemory && currentId === conversationId ? this.data.chatRecords : [];
      const localRecords = this.readLocalChatRecords(conversationId);
      const localBest = this.pickBestChatRecords([inMemory, localRecords]);
      this.showChatRecords(conversationId, localBest);
      const hasLocalUser = this.countUserMessages(localBest) > 0;
      if (!allowCloud || hasLocalUser || isLocalConversationId(conversationId)) {
        return;
      }
      try {
        const botId = this.data.agentConfig.botId;
        const cloudInstance = await getCloudInstance(this.data.envShareConfig);
        const ai = cloudInstance.extend.AI;
        const acp = await acpSend(ai, botId, "session/load", {
          sessionId: conversationId,
          conversationId,
          replay: true,
          pageNumber: 1,
          pageSize: 100,
        });
        if (token !== this._historyLoadToken) {
          return;
        }
        console.log("[yuanqichat] session/load", conversationId, (acp.records || []).length, acp.error || "");
        let records = acp.records || [];
        if (!records.length) {
          records = extractRecordList(acp.result) || extractRecordList(acp);
        }
        if (!records.length) {
          records = await cloudLoadRecords(botId, conversationId);
        }
        const cloudRecords = this.sanitizeChatRecords(records, true);
        const best = this.pickBestChatRecords([localBest, this.readLocalChatRecords(conversationId), cloudRecords]);
        if (this.showChatRecords(conversationId, best)) {
          return;
        }
      } catch (e) {
        console.log("loadConversationHistory e", e);
        if (token !== this._historyLoadToken) {
          return;
        }
        try {
          const fallback = await cloudLoadRecords(this.data.agentConfig.botId, conversationId);
          const best = this.pickBestChatRecords([
            this.sanitizeChatRecords(fallback, true),
            this.readLocalChatRecords(conversationId),
          ]);
          if (this.showChatRecords(conversationId, best)) {
            return;
          }
        } catch (storeErr) {
          console.log("[agentStore] load", storeErr);
        }
        if (this.showChatRecords(conversationId, this.readLocalChatRecords(conversationId))) {
          return;
        }
        wx.showToast({
          title: "加载历史失败",
          icon: "none",
        });
      }
    },
    fetchConversationList: async function (isDefault, botId) {
      if (this.data.fetchConversationLoading) {
        return;
      }
      this.setData({
        fetchConversationLoading: true,
      });
      try {
        const { page, size } = this.data.conversationPageOptions;
        const pageNumber = page || 1;
        const pageSize = size || 20;
        const cloudInstance = await getCloudInstance(this.data.envShareConfig);
        const ai = cloudInstance.extend.AI;
        let list = [];
        let acp = null;
        try {
          acp = await acpSend(ai, botId, "session/list", { pageNumber, pageSize });
          list = extractConversationList(acp.result) || [];
          if (!list.length) {
            list = extractConversationList(acp);
          }
        } catch (acpErr) {
          console.log("[yuanqichat] session/list", acpErr);
        }
        try {
          const stored = await cloudListConversations(botId, pageNumber, pageSize);
          if (stored.data && stored.data.length) {
            const map = {};
            list.concat(stored.data).forEach((item) => {
              if (item && item.conversationId) map[item.conversationId] = item;
            });
            list = Object.keys(map).map((key) => map[key]);
          }
        } catch (storeErr) {
          console.log("[agentStore] list", storeErr);
        }
        const total = Math.max((acp && acp.result && acp.result.total) || 0, list.length);
        console.log("[yuanqichat] getConversation", list.length, acp && (acp.result || acp));
        return { list, total, raw: acp };
      } catch (e) {
        console.log("conversation list e", e);
        throw e;
      } finally {
        this.setData({
          fetchConversationLoading: false,
        });
      }
    },
    createConversation: async function (title) {
      const botId = this.data.agentConfig.botId;
      const cloudInstance = await getCloudInstance(this.data.envShareConfig);
      const ai = cloudInstance.extend.AI;
      const sessionTitle = (title && String(title).replace(/\s+/g, " ").trim().slice(0, 20)) || "新会话";
      try {
        const acp = await acpSend(ai, botId, "session/new", { title: sessionTitle });
        const conversationId =
          acp.sessionId ||
          (acp.result && (acp.result.sessionId || acp.result.conversationId)) ||
          (extractConversation(acp.result) && extractConversation(acp.result).conversationId);
        console.log("[yuanqichat] createConversation http", conversationId, acp.result || acp);
        if (conversationId) {
          return {
            conversationId,
            title: (acp.result && acp.result.title) || sessionTitle,
            createTime: (acp.result && acp.result.createTime) || Date.now(),
            fromServer: true,
          };
        }
        if (acp.error) {
          console.log("[yuanqichat] createConversation acp error", acp.error);
        }
      } catch (e) {
        console.log("[yuanqichat] createConversation http", formatCloudError(e));
      }
      return {
        conversationId: makeConversationId(),
        title: sessionTitle,
        createTime: Date.now(),
        fromServer: false,
      };
    },
    isBusyReply: function (text) {
      return typeof text === "string" && /网络繁忙/.test(text);
    },
    sendYuanqiMessage: async function (ai, botId, msg, conversationId, fromServer) {
      const params = {
        prompt: [{ type: "text", text: msg }],
      };
      if (conversationId && !/^c-\d+/.test(conversationId)) {
        params.sessionId = conversationId;
      }
      const lastValueIndex = this.data.chatRecords.length - 1;
      let lastPaint = 0;
      let paintTimer = null;
      let pendingText = "";
      const paint = (text) => {
        pendingText = text;
        const apply = () => {
          lastPaint = Date.now();
          paintTimer = null;
          this.setData({
            chatStatus: 3,
            [`chatRecords[${lastValueIndex}].content`]: pendingText,
            [`chatRecords[${lastValueIndex}].role`]: "assistant",
          });
        };
        if (Date.now() - lastPaint >= 80) {
          apply();
          return;
        }
        if (!paintTimer) {
          paintTimer = setTimeout(apply, 80);
        }
      };
      const collected = await acpSend(ai, botId, "session/prompt", params, paint);
      if (paintTimer) {
        clearTimeout(paintTimer);
        paintTimer = null;
      }
      collected.usedConversationId = collected.sessionId || params.sessionId || "";
      if (!collected.text && !collected.error && collected.chunkCount === 0) {
        collected.error =
          "ACP 无回复。已把网关 /send-message 改写为 /acp。请看 Console 是否出现 rewrite send-message -> acp。";
      }
      return collected;
    },
    replaceConversationId: function (oldId, newId) {
      if (!oldId || !newId || oldId === newId) {
        return;
      }
      const rewrite = (list) =>
        (list || []).map((item) => {
          if (!item || item.conversationId !== oldId) {
            return item;
          }
          return Object.assign({}, item, { conversationId: newId, fromServer: true });
        });
      const merged = this.mergeConversationLists([rewrite(this.readLocalConversations()), rewrite(this.data.conversations)]);
      this.writeLocalConversations(merged);
      if (oldId && newId && oldId !== newId) {
        const cached = this.readLocalChatRecords(oldId);
        if (cached.length) {
          this.writeLocalChatRecords(newId, cached);
          this.removeLocalChatRecords(oldId);
        }
      }
      this.setData({
        conversations: merged,
        transformConversations: this.transformConversationList(merged),
      });
    },
    deleteConversation: async function (conversationId) {
      const botId = this.data.agentConfig.botId;
      const cloudInstance = await getCloudInstance(this.data.envShareConfig);
      const ai = cloudInstance.extend.AI;
      try {
        await cloudDeleteConversation(botId, conversationId);
      } catch (e) {
        console.log("[agentStore] delete", e);
      }
      return acpSend(ai, botId, "session/delete", { sessionId: conversationId });
    },
    handleDeleteConversation: async function (e) {
      const { conversation } = e.currentTarget.dataset;
      const that = this;

      this.hideActionMenu();

      wx.showModal({
        title: "提示",
        content: "确认删除当前会话？",
        confirmText: "删除",
        confirmColor: "#ff303b",
        success: async function (res) {
          if (res.confirm) {
            try {
              await that.deleteConversation(conversation.conversationId);
              const updatedConversations = that.mergeConversationLists([
                that.readLocalConversations().filter((item) => item.conversationId !== conversation.conversationId),
                that.data.conversations.filter((item) => item.conversationId !== conversation.conversationId),
              ]);
              that.writeLocalConversations(updatedConversations);
              that.removeLocalChatRecords(conversation.conversationId);
              that.setData({
                conversations: updatedConversations,
                transformConversations: that.transformConversationList(updatedConversations),
              });

              if (that.data.conversation?.conversationId === conversation.conversationId) {
                that.clearChatRecords();
              }

              wx.showToast({
                title: "删除成功",
                icon: "success",
              });
            } catch (error) {
              console.error("删除会话失败", error);
              wx.showToast({
                title: "删除失败，请稍后重试",
                icon: "error",
              });
            }
          }
        },
      });
    },
    handleLongPressConversation: function (e) {
      // 长按会话，显示操作菜单
      const { conversation } = e.currentTarget.dataset;
      this.setData({
        showActionMenu: true,
        selectedConversation: conversation,
      });
    },
    hideActionMenu: function () {
      // 隐藏操作菜单
      this.setData({
        showActionMenu: false,
        selectedConversation: null,
      });
    },
    clickCreateInDrawer: function () {
      this.setData({
        isDrawerShow: false,
      });
      this.createNewConversation();
    },
    upsertConversationInList: function (conv) {
      if (!conv || !conv.conversationId) {
        return;
      }
      const now = Date.now();
      const title = (conv.title || "").trim();
      if (!title || title === "新会话") {
        return;
      }
      const item = {
        conversationId: conv.conversationId,
        title,
        createTime: conv.createTime || now,
        updateTime: conv.updateTime || now,
      };
      const merged = this.mergeConversationLists([
        this.readLocalConversations(),
        this.data.conversations || [],
        [item],
      ]);
      this.writeLocalConversations(merged);
      this.setData({
        conversations: merged,
        transformConversations: this.transformConversationList(merged),
      });
    },
    createNewConversation: async function () {
      this.persistCurrentChat();
      this.clearChatRecords();
      this.setData({
        conversation: null,
        canPullHistory: false,
        refreshText: "下拉加载历史记录",
      });
    },
    scrollConToBottom: async function (e) {
      console.log("scrollConToBottom", e);
      const { page, size } = this.data.conversationPageOptions;
      if (page * size >= this.data.conversationPageOptions.total) {
        return;
      }
      this.setData({
        conversationPageOptions: {
          ...this.data.conversationPageOptions,
          page: this.data.conversationPageOptions.page + 1,
        },
      });
      // 调用分页接口查询更多
      if (this.data.bot.botId) {
        const res = await this.fetchConversationList(false, this.data.bot.botId);
        if (res && res.list && res.list.length) {
          const addConversations = [...this.data.conversations, ...res.list];
          const sortConData = addConversations.sort(
            (a, b) => new Date(b.updateTime || b.createTime).getTime() - new Date(a.updateTime || a.createTime).getTime()
          );
          this.setData({
            conversations: sortConData,
            transformConversations: this.transformConversationList(sortConData),
            conversationPageOptions: {
              ...this.data.conversationPageOptions,
              total: res.total || sortConData.length,
            },
          });
        }
      }
    },
    resetFetchConversationList: async function () {
      this.setData({
        conversationPageOptions: {
          page: 1,
          size: 20,
          total: 0,
        },
      });
      const local = this.readLocalConversations();
      const current =
        this.data.conversation && this.data.conversation.conversationId ? [this.data.conversation] : [];
      let server = [];
      try {
        if (!this._skipCloudConversationList && this.data.bot.botId) {
          const res = await this.fetchConversationList(false, this.data.bot.botId);
          server = (res && res.list) || [];
        }
      } catch (e) {
        console.log("fetchConversationList e", e);
      }
      this._skipCloudConversationList = false;
      const merged = this.mergeConversationLists([local, this.data.conversations || [], server, current]).filter(
        (item) => {
          if (!item || !item.conversationId) {
            return false;
          }
          const title = (item.title || "").trim();
          if (title && title !== "新会话") {
            return true;
          }
          return this.readLocalChatRecords(item.conversationId).length > 0;
        }
      );
      this.writeLocalConversations(merged);
      this.setData({
        conversations: merged,
        transformConversations: this.transformConversationList(merged),
        conversationPageOptions: {
          page: 1,
          size: 20,
          total: merged.length,
        },
      });
    },
    wipeSidebarForFreshTest: async function () {
      const flag = "yuanqi_sidebar_wiped_20260828c";
      try {
        if (wx.getStorageSync(flag)) {
          return;
        }
      } catch (e) {
        /* ignore */
      }
      const botId = (this.data.agentConfig && this.data.agentConfig.botId) || (this.data.bot && this.data.bot.botId);
      const local = this.readLocalConversations();
      let server = [];
      try {
        if (botId) {
          const res = await this.fetchConversationList(false, botId);
          server = (res && res.list) || [];
        }
      } catch (e) {
        console.log("[yuanqichat] wipe list", e);
      }
      const all = this.mergeConversationLists([local, this.data.conversations || [], server]);
      for (let i = 0; i < all.length; i += 1) {
        const id = all[i] && all[i].conversationId;
        if (!id) continue;
        try {
          await this.deleteConversation(id);
        } catch (e) {
          console.log("[yuanqichat] wipe delete", id, e);
        }
        this.removeLocalChatRecords(id);
      }
      try {
        const info = wx.getStorageInfoSync();
        (info.keys || []).forEach((key) => {
          if (key && key.indexOf("yuanqi_") === 0 && key !== flag) {
            wx.removeStorageSync(key);
          }
        });
      } catch (e) {
        this.writeLocalConversations([]);
      }
      const welcome = {
        content: (this.data.bot && this.data.bot.welcomeMessage) || "你好，我是彼安诺，有什么想聊的",
        record_id: "record_id" + String(+new Date() + 10),
        role: "assistant",
        hiddenBtnGround: true,
      };
      this._skipCloudConversationList = true;
      this.setData({
        conversations: [],
        transformConversations: this.transformConversationList([]),
        conversation: null,
        chatRecords: [welcome],
        questions: [],
        chatStatus: 0,
      });
      try {
        wx.setStorageSync(flag, 1);
      } catch (e) {
        /* ignore */
      }
      console.log("[yuanqichat] sidebar wiped for fresh test");
    },
    transformConversationList: function (conversations) {
      // 区分今天，本月，更早
      const todayCon = [];
      const curMonthCon = [];
      const earlyCon = [];
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const monthFirstDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      for (let item of conversations) {
        let itemDate = new Date(item.createTime || item.updateTime || Date.now()).getTime();
        if (!itemDate) {
          itemDate = Date.now();
        }
        if (itemDate >= todayStart) {
          todayCon.push(item);
        } else if (itemDate >= monthFirstDate) {
          curMonthCon.push(item);
        } else {
          earlyCon.push(item);
        }
      }
      return {
        todayCon,
        curMonthCon,
        earlyCon,
      };
    },
    getChatStoreKey: function (conversationId) {
      const botId = this.data.agentConfig.botId || "default";
      return `yuanqi_chat_${botId}_${conversationId || ""}`;
    },
    readLocalChatRecords: function (conversationId) {
      if (!conversationId) {
        return [];
      }
      try {
        const list = wx.getStorageSync(this.getChatStoreKey(conversationId)) || [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },
    writeLocalChatRecords: function (conversationId, list) {
      if (!conversationId) {
        return;
      }
      const records = (list || []).filter((item) => item && item.content);
      if (!records.length) {
        return;
      }
      try {
        wx.setStorageSync(this.getChatStoreKey(conversationId), records.slice(-100));
      } catch (e) {
        console.log("writeLocalChatRecords", e);
      }
    },
    removeLocalChatRecords: function (conversationId) {
      if (!conversationId) {
        return;
      }
      try {
        wx.removeStorageSync(this.getChatStoreKey(conversationId));
      } catch (e) {
        console.log("removeLocalChatRecords", e);
      }
    },
    persistCurrentChat: function (conversationId) {
      const convId = conversationId || (this.data.conversation && this.data.conversation.conversationId);
      if (!convId) {
        return;
      }
      const records = this.sanitizeChatRecords(this.data.chatRecords);
      if (!records.length) {
        return;
      }
      this.writeLocalChatRecords(convId, records);
      const botId = this.data.agentConfig.botId;
      const title =
        (this.data.conversation && this.data.conversation.title) ||
        (records.find((item) => item.role === "user" && item.content) || {}).content ||
        "";
      cloudSaveChat({
        botId,
        conversationId: convId,
        title: String(title).replace(/\s+/g, " ").trim().slice(0, 20),
        records,
      });
    },
    getClassicStoreKey: function (botId) {
      return `yuanqi_conversations_${botId || this.data.agentConfig.botId || "default"}`;
    },
    readLocalConversations: function () {
      try {
        const list = wx.getStorageSync(this.getClassicStoreKey()) || [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },
    writeLocalConversations: function (list) {
      try {
        wx.setStorageSync(this.getClassicStoreKey(), (list || []).slice(0, 50));
      } catch (e) {
        console.log("writeLocalConversations", e);
      }
    },
    mergeConversationLists: function (lists) {
      const map = {};
      (lists || []).forEach((list) => {
        (list || []).forEach((item) => {
          if (!item || !item.conversationId) {
            return;
          }
          const prev = map[item.conversationId];
          if (!prev) {
            map[item.conversationId] = {
              conversationId: item.conversationId,
              title: item.title || "新会话",
              createTime: item.createTime || Date.now(),
              updateTime: item.updateTime || item.createTime || Date.now(),
            };
            return;
          }
          const betterTitle =
            item.title && item.title !== "新会话" ? item.title : prev.title && prev.title !== "新会话" ? prev.title : item.title || prev.title || "新会话";
          map[item.conversationId] = {
            conversationId: item.conversationId,
            title: betterTitle,
            createTime: prev.createTime || item.createTime,
            updateTime: item.updateTime || prev.updateTime,
          };
        });
      });
      return Object.keys(map)
        .map((key) => map[key])
        .sort(
          (a, b) =>
            new Date(b.updateTime || b.createTime || 0).getTime() -
            new Date(a.updateTime || a.createTime || 0).getTime()
        );
    },
    getThreadStoreKey: function (botId) {
      return `agent_threads_${botId || this.data.agentV2Config.agentID || "default"}`;
    },
    toConversationSummary: function (item) {
      return {
        conversationId: item.conversationId,
        threadId: item.threadId,
        title: item.title,
        createTime: item.createTime,
        updateTime: item.updateTime,
      };
    },
    titleFromMessages: function (messages) {
      const user = (messages || []).find((item) => item.role === "user" && item.content);
      const text = user && user.content ? String(user.content).replace(/\s+/g, " ").trim() : "";
      return text ? text.slice(0, 24) : "新对话";
    },
    readLocalThreads: function (botId) {
      try {
        const list = wx.getStorageSync(this.getThreadStoreKey(botId)) || [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        console.log("readLocalThreads", e);
        return [];
      }
    },
    writeLocalThreads: function (botId, list) {
      wx.setStorageSync(this.getThreadStoreKey(botId), list);
    },
    findLocalThread: function (conversationId) {
      const botId = this.data.agentV2Config.agentID;
      return this.readLocalThreads(botId).find((item) => item.conversationId === conversationId);
    },
    removeLocalThread: function (conversationId) {
      const botId = this.data.agentV2Config.agentID;
      const next = this.readLocalThreads(botId).filter((item) => item.conversationId !== conversationId);
      this.writeLocalThreads(botId, next);
      return next;
    },
    refreshLocalConversationList: function () {
      const botId = this.data.agentV2Config.agentID;
      const summaries = this.readLocalThreads(botId).map((item) => this.toConversationSummary(item));
      this.setData({
        conversations: summaries,
        transformConversations: this.transformConversationList(summaries),
      });
    },
    persistCurrentThread: function () {
      if (!this.data.isAgent) {
        return;
      }
      const { threadId, messages } = this.data;
      const botId = this.data.agentV2Config.agentID;
      if (!threadId || !botId) {
        return;
      }
      const hasUser = (messages || []).some((item) => item.role === "user");
      if (!hasUser) {
        return;
      }
      const list = this.readLocalThreads(botId);
      const now = new Date().toISOString();
      const idx = list.findIndex((item) => item.conversationId === threadId);
      const item = {
        conversationId: threadId,
        threadId,
        title: this.titleFromMessages(messages),
        createTime: idx >= 0 ? list[idx].createTime : now,
        updateTime: now,
        messages,
      };
      if (idx >= 0) {
        list.splice(idx, 1);
      }
      list.unshift(item);
      const trimmed = list.slice(0, 50);
      this.writeLocalThreads(botId, trimmed);
      this.setData({
        conversation: { conversationId: threadId, title: item.title },
        conversations: trimmed.map((row) => this.toConversationSummary(row)),
        transformConversations: this.transformConversationList(trimmed),
      });
    },
    syncUserInfo: function () {
      try {
        const app = getApp();
        const user = (app && app.globalData && app.globalData.userInfo) || wx.getStorageSync("userInfo") || {};
        this.setData({
          userAvatar: user.avatarFileID || user.avatarUrl || "/components/agent-ui/imgs/wechat.svg",
          userName: user.nickName || "微信用户",
          userHint: user.needProfile || !user.openid ? "完善资料" : "查看登录信息",
        });
      } catch (e) {}
    },
    goProfile: function () {
      this.closeDrawer();
      wx.navigateTo({
        url: "/pages/profile/profile",
      });
    },
    openDrawer: async function () {
      this.syncUserInfo();
      this.setData({
        isDrawerShow: true,
      });
      await this.resetFetchConversationList();
    },
    closeDrawer() {
      this.setData({
        isDrawerShow: false,
      });
    },
    showErrorMsg: function (e) {
      const { content, reqid } = e.currentTarget.dataset;
      // console.log("content", content);
      const transformContent =
        typeof content === "string"
          ? reqid
            ? `${content}|reqId:${reqid}`
            : content
          : JSON.stringify({ err: content, reqid });
      wx.showModal({
        title: "错误原因",
        content: transformContent,
        success() {
          wx.setClipboardData({
            data: transformContent,
            success: function (res) {
              wx.showToast({
                title: "复制错误完成",
                icon: "success",
              });
            },
          });
        },
      });
    },
    transformToolCallHistoryList: function (toolCallList) {
      const callParamsList = toolCallList.filter((item) => item.type === "tool-call");
      // const callResultList = toolCallList.filter(item => item.type === 'tool-result')
      const callContentList = toolCallList.filter((item) => item.type === "text");
      const transformToolCallList = [];
      for (let i = 0; i < callParamsList.length; i++) {
        const curParam = callParamsList[i];
        const curResult = toolCallList.find(
          (item) => item.type === "tool-result" && item.toolCallId === curParam.tool_call.id
        );
        const curContent = callContentList[i];
        const curError = toolCallList.find(
          (item) => item.finish_reason === "error" && item.error.message.toolCallId === curParam.tool_call.id
          // (item) => item.finish_reason === "error"
        );
        const transformToolCallObj = {
          id: curParam.tool_call.id,
          name: this.transformToolName(curParam.tool_call.function.name),
          rawParams: curParam.tool_call.function.arguments,
          callParams: "```json\n\n" + JSON.stringify(curParam.tool_call.function.arguments, null, 2) + "\n```",
          content: ((curContent && curContent.content) || "").replaceAll("\t", "").replaceAll("\n", "\n\n"),
        };
        if (curResult) {
          transformToolCallObj.rawResult = curResult.result;
          transformToolCallObj.callResult = "```json\n\n" + JSON.stringify(curResult.result, null, 2) + "\n```";
        }
        if (curError) {
          transformToolCallObj.error = curError;
        }

        transformToolCallList.push(transformToolCallObj);
      }
      return transformToolCallList;
    },
    handleLineChange: function (e) {
      // console.log("linechange", e.detail.lineCount);
      // 查foot-function height
      const self = this;
      const query = wx.createSelectorQuery().in(this);
      query
        .select(".foot_function")
        .boundingClientRect(function (res) {
          if (res) {
            self.setData({
              textareaHeight: res.height,
            });
          } else {
            // console.log("未找到指定元素");
          }
        })
        .exec();
    },
    openFeedback: function (e) {
      const { feedbackrecordid, feedbacktype } = e.currentTarget.dataset;
      let index = null;
      this.data.chatRecords.forEach((item, _index) => {
        if (item.record_id === feedbackrecordid) {
          index = _index;
        }
      });
      const inputRecord = this.data.chatRecords[index - 1];
      const answerRecord = this.data.chatRecords[index];
      // console.log(record)
      this.setData({
        isShowFeedback: true,
        feedbackRecordId: feedbackrecordid,
        feedbackType: feedbacktype,
        aiAnswer: answerRecord.content,
        input: inputRecord.content,
      });
    },
    closefeedback: function () {
      this.setData({ isShowFeedback: false, feedbackRecordId: "", feedbackType: "" });
    },
    // 滚动相关处理
    calculateContentHeight() {
      return new Promise((resolve) => {
        const query = wx.createSelectorQuery().in(this);
        query
          .selectAll(".main >>> .contentBox")
          .boundingClientRect((rects) => {
            let totalHeight = 0;
            rects.forEach((rect) => {
              totalHeight += rect.height;
            });
            resolve(totalHeight);
          })
          .exec();
      });
    },
    calculateContentInTop() {
      // console.log('执行top 部分计算')
      return new Promise((resolve) => {
        const query = wx.createSelectorQuery().in(this);
        query
          .selectAll(".main >>> .nav, .main >>> .tips")
          .boundingClientRect((rects) => {
            let totalHeight = 0;
            rects.forEach((rect) => {
              totalHeight += rect.height;
            });
            // console.log('top height', totalHeight);
            resolve(totalHeight);
          })
          .exec();
      });
    },
    onWheel: function (e) {
      // 解决小程序开发工具中滑动
      if (!this.data.manualScroll && e.detail.deltaY < 0) {
        this.setData({
          manualScroll: true,
        });
      }
    },
    onScroll: function (e) {
      if (e.detail.scrollTop < this.data.lastScrollTop) {
        // 鸿蒙系统上可能滚动事件，拖动事件失效，兜底处理
        this.setData({
          manualScroll: true,
        });
      }

      this.setData({
        lastScrollTop: e.detail.scrollTop,
      });

      // 针对连续滚动的最后一次进行处理，scroll-view的 scroll end事件不好判定
      if (this.data.scrollTimer) {
        clearTimeout(this.data.scrollTimer);
      }

      this.setData({
        scrollTimer: setTimeout(() => {
          const newTop = Math.max(this.data.scrollTop, e.detail.scrollTop);
          if (this.data.manualScroll) {
            this.setData({
              scrollTop: newTop,
            });
          } else {
            this.setData({
              scrollTop: newTop,
              viewTop: newTop,
            });
          }
        }, 100),
      });
    },
    handleScrollStart: function (e) {
      // console.log("drag start", e);
      if (e.detail.scrollTop > 0 && !this.data.manualScroll) {
        // 手动开始滚
        this.setData({
          manualScroll: true,
        });
      }
    },
    handleScrollToLower: function (e) {
      // console.log("scroll to lower", e);
      // 到底转自动
      this.setData({
        manualScroll: false,
      });
    },
    autoToBottom: function () {
      this.setData({
        manualScroll: false,
        scrollTo: "scroll-bottom",
      });
    },
    initKeyboardInset: function () {
      try {
        const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
        this._initialWindowHeight = info.windowHeight || 0;
        if (wx.setBackgroundColor) {
          wx.setBackgroundColor({
            backgroundColor: "#F7F7F8",
            backgroundColorTop: "#F7F7F8",
            backgroundColorBottom: "#F7F7F8",
          });
        }
      } catch (e) {
        this._initialWindowHeight = 0;
      }
      this._onKeyboardHeightChange = (res) => {
        this.updateKeyboardHeight((res && res.height) || 0);
      };
      if (wx.onKeyboardHeightChange) {
        wx.onKeyboardHeightChange(this._onKeyboardHeightChange);
      }
    },
    updateKeyboardHeight: function (height) {
      const keyboardHeight = Math.max(0, Number(height) || 0);
      if (keyboardHeight > 0 && this._keyboardBlurTimer) {
        clearTimeout(this._keyboardBlurTimer);
        this._keyboardBlurTimer = null;
      }
      let extra = keyboardHeight;
      try {
        const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
        const currentHeight = info.windowHeight || this._initialWindowHeight || 0;
        const resized = Math.max(0, (this._initialWindowHeight || currentHeight) - currentHeight);
        extra = Math.max(0, keyboardHeight - resized);
      } catch (e) {
        extra = keyboardHeight;
      }
      if (extra === this.data.keyboardHeight) {
        return;
      }
      this.setData({
        keyboardHeight: extra,
      });
      if (extra > 0) {
        this.autoToBottom();
      }
    },
    bindInputFocus: function (e) {
      this.setData({
        manualScroll: false,
      });
      if (this._keyboardBlurTimer) {
        clearTimeout(this._keyboardBlurTimer);
        this._keyboardBlurTimer = null;
      }
      const height = e && e.detail && e.detail.height;
      if (typeof height === "number" && height > 0) {
        this.updateKeyboardHeight(height);
      }
      this.autoToBottom();
    },
    bindInputBlur: function () {
      if (this._keyboardBlurTimer) {
        clearTimeout(this._keyboardBlurTimer);
      }
      this._keyboardBlurTimer = setTimeout(() => {
        this.updateKeyboardHeight(0);
      }, 80);
    },
    onTextareaKeyboardHeightChange: function (e) {
      this.updateKeyboardHeight((e && e.detail && e.detail.height) || 0);
    },
    bindKeyInput: function (e) {
      this.setData({
        inputValue: e.detail.value,
      });
    },
    handleRefresh: function (e) {
      if (this.data.triggered) {
        return;
      }
      this.setData({
        triggered: true,
        refreshText: "刷新中",
      });
      const finish = (text) => {
        this.setData({
          triggered: false,
          refreshText: text || "下拉加载历史记录",
        });
      };
      const conversationId = this.data.conversation && this.data.conversation.conversationId;
      this.persistCurrentChat(conversationId);
      if (this.data.chatMode !== "bot" || !conversationId) {
        finish("下拉加载历史记录");
        return;
      }
      const localBest = this.pickBestChatRecords([
        this.data.chatRecords,
        this.readLocalChatRecords(conversationId),
      ]);
      if (this.countUserMessages(localBest) > 0) {
        this.showChatRecords(conversationId, localBest);
        finish("到底啦");
        return;
      }
      this.loadConversationHistory(conversationId, { allowCloud: true })
        .then(() => {
          const loaded = this.countUserMessages(this.data.chatRecords);
          finish(loaded > 0 ? "到底啦" : "下拉加载历史记录");
        })
        .catch(() => {
          finish("下拉加载历史记录");
        });
    },
    handleTapClear: function (e) {
      this.clearChatRecords();
    },
    clearChatRecords: function () {
      const chatMode = this.data.chatMode;
      const { bot } = this.data;
      this.setData({ showTools: false });
      if (chatMode === "model") {
        this.setData({
          chatRecords: [],
          chatStatus: 0,
        });
        return;
      }
      if (this.data.isAgent) {
        const questions = randomSelectInitquestion(bot.initQuestions, 3);
        this.setData({
          messages: [],
          chatStatus: 0,
          threadId: "threadId_" + String(+new Date()),
          questions,
          conversation: null,
          canPullHistory: false,
        });
        return;
      }
      const record = {
        content: bot.welcomeMessage || "你好，我是彼安诺，有什么想聊的",
        record_id: "record_id" + String(+new Date() + 10),
        role: "assistant",
        hiddenBtnGround: true,
      };
      const questions = randomSelectInitquestion(bot.initQuestions, 3);
      this.setData({
        chatRecords: [record],
        chatStatus: 0,
        questions,
        page: 1, // 重置分页页码
        conversation: null,
        canPullHistory: false,
      });
    },
    chooseMedia: function (sourceType) {
      const self = this;
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [sourceType],
        maxDuration: 30,
        camera: "back",
        success(res) {
          // console.log("res", res);
          // console.log("tempFiles", res.tempFiles);
          const isImageSizeValid = res.tempFiles.every((item) => item.size <= 30 * 1024 * 1024);
          if (!isImageSizeValid) {
            wx.showToast({
              title: "图片大小30M限制",
              icon: "error",
            });
            return;
          }
          const tempFiles = res.tempFiles.map((item) => {
            const tempFileInfos = item.tempFilePath.split(".");
            const tempFileName = md5(tempFileInfos[0]) + "." + tempFileInfos[1];
            return {
              tempId: tempFileName,
              rawType: item.fileType, // 微信选择默认的文件类型 image/video/file
              tempFileName: tempFileName, // 文件名
              rawFileName: "", // 图片类不带源文件名
              tempPath: item.tempFilePath,
              fileSize: item.size,
              fileUrl: "",
              fileId: "",
              botId: self.data.agentConfig.botId,
              status: "",
            };
          });

          const finalFileList = [...tempFiles];
          // console.log("final", finalFileList);
          self.setData({
            sendFileList: finalFileList, //
          });
          if (finalFileList.length) {
            self.setData({
              showTools: false,
            });
            if (!self.data.showFileList) {
              self.setData({
                showFileList: true,
              });
            }
          }
        },
      });
    },
    handleUploadImg: function (sourceType) {
      if (!this.data.bot.searchFileEnable) {
        wx.showModal({
          title: "提示",
          content: "请前往腾讯云开发平台启用 Agent 文件上传功能",
        });
        return;
      }
      if (this.data.useWebSearch) {
        wx.showModal({
          title: "提示",
          content: "联网搜索不支持上传文件/图片",
        });
        return;
      }
      const self = this;
      const isCurSendFile = this.data.sendFileList.find((item) => item.rawType === "file");
      if (isCurSendFile) {
        wx.showModal({
          title: "确认替换吗",
          content: "上传图片将替换当前文件内容",
          showCancel: "true",
          cancelText: "取消",
          confirmText: "确认",
          success(res) {
            // console.log("res", res);
            self.chooseMedia(sourceType);
          },
          fail(error) {
            // console.log("choose file e", error);
          },
        });
      } else {
        self.chooseMedia(sourceType);
      }
    },
    chooseMessageFile: function () {
      // console.log("触发choose");
      const self = this;
      const oldFileLen = this.data.sendFileList.filter((item) => item.rawType === "file").length;
      // console.log("oldFileLen", oldFileLen);
      const subFileCount = oldFileLen <= 5 ? 5 - oldFileLen : 0;
      if (subFileCount === 0) {
        wx.showToast({
          title: "文件数量限制5个",
          icon: "error",
        });
        return;
      }
      wx.chooseMessageFile({
        count: subFileCount,
        type: "file",
        success(res) {
          // tempFilePath可以作为img标签的src属性显示图片
          // const tempFilePaths = res.tempFiles;
          // console.log("res", res);
          // 检验文件后缀
          const isFileExtValid = res.tempFiles.every((item) => self.checkFileExt(item.name.split(".")[1]));
          if (!isFileExtValid) {
            wx.showModal({
              content: "当前支持文件类型为 pdf、txt、doc、docx、ppt、pptx、xls、xlsx、csv",
              showCancel: false,
              confirmText: "确定",
            });
            return;
          }
          // 校验各文件大小是否小于10M
          const isFileSizeValid = res.tempFiles.every((item) => item.size <= 10 * 1024 * 1024);
          if (!isFileSizeValid) {
            wx.showToast({
              title: "单文件10M限制",
              icon: "error",
            });
            return;
          }
          const tempFiles = res.tempFiles.map((item) => {
            const tempFileInfos = item.path.split(".");
            const tempFileName = md5(tempFileInfos[0]) + "." + tempFileInfos[1];
            return {
              tempId: tempFileName,
              rawType: item.type, // 微信选择默认的文件类型 image/video/file
              tempFileName: tempFileName, // 文件名
              rawFileName: item.name,
              tempPath: item.path,
              fileSize: item.size,
              fileUrl: "",
              fileId: "",
              botId: self.data.agentConfig.botId,
              status: "",
            };
          });
          // 过滤掉已选择中的 image 文件（保留file)
          const filterFileList = self.data.sendFileList.filter((item) => item.rawType !== "image");
          const finalFileList = [...filterFileList, ...tempFiles];
          console.log("final", finalFileList);

          self.setData({
            sendFileList: finalFileList, //
          });

          if (finalFileList.length) {
            self.setData({
              showTools: false,
            });
            if (!self.data.showFileList) {
              self.setData({
                showFileList: true,
              });
            }
          }
        },
        fail(e) {
          console.log("choose e", e);
        },
      });
    },
    handleUploadMessageFile: function () {
      // 判断agent 配置是否打开上传文件
      if (!this.data.bot.searchFileEnable) {
        wx.showModal({
          title: "提示",
          content: "请前往腾讯云开发平台启用 Agent 文件上传功能",
        });
        return;
      }
      if (this.data.useWebSearch) {
        wx.showModal({
          title: "提示",
          content: "联网搜索不支持上传文件/图片",
        });
        return;
      }

      const self = this;
      const isCurSendImage = this.data.sendFileList.find((item) => item.rawType === "image");
      if (isCurSendImage) {
        wx.showModal({
          title: "确认替换吗",
          content: "上传文件将替换当前图片内容",
          showCancel: "true",
          cancelText: "取消",
          confirmText: "确认",
          success(res) {
            console.log("res", res);
            self.chooseMessageFile();
          },
          fail(error) {
            console.log("choose file e", error);
          },
        });
      } else {
        self.chooseMessageFile();
      }
    },
    handleAlbum: function () {
      this.handleUploadImg("album");
    },
    handleCamera: function () {
      this.handleUploadImg("camera");
    },
    checkFileExt: function (ext) {
      return ["pdf", "txt", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv"].includes(ext);
    },
    stop: function () {
      this.autoToBottom();
      if (this.data.isAgent) {
        this.setData({
          chatStatus: 0, // 暂停之后切回正常状态
        });
      } else {
        const { chatRecords, chatStatus } = this.data;
        const newChatRecords = [...chatRecords];
        const record = newChatRecords[newChatRecords.length - 1];
        if (chatStatus === 1) {
          record.content = "已暂停生成";
        }
        // 暂停思考
        if (chatStatus === 2) {
          record.pauseThinking = true;
        }
        this.setData({
          chatRecords: newChatRecords,
          manualScroll: false,
          chatStatus: 0, // 暂停之后切回正常状态
        });
      }
    },
    openSetPanel: function () {
      this.setData({ setPanelVisibility: true });
    },
    closeSetPanel: function () {
      this.setData({ setPanelVisibility: false });
    },
    handleSendMessage: async function (event) {
      // 发送消息前校验所有文件上传状态
      if (this.data.sendFileList.some((item) => !item.fileId || item.status !== "parsed")) {
        wx.showToast({
          title: "文件上传解析中",
          icon: "error",
        });
        return;
      }
      if (this.data.isAgent) {
        await this.handleSendMessageV2(event.currentTarget.dataset.message);
      } else {
        await this.sendMessage(event.currentTarget.dataset.message);
      }
    },
    sendMessage: async function (message) {
      if (this.data.showFileList) {
        this.setData({
          showFileList: !this.data.showFileList,
        });
      }
      if (this.data.showTools) {
        this.setData({
          showTools: !this.data.showTools,
        });
      }
      // const { message } = event.currentTarget.dataset;
      let { inputValue, bot, agentConfig, chatRecords, chatStatus, modelConfig } = this.data;
      // 如果正在进行对话，不让发送消息
      if (chatStatus !== 0) {
        return;
      }
      // 将传进来的消息给到inputValue
      if (message) {
        inputValue = message;
      }
      // 空消息返回
      if (!inputValue) {
        return;
      }

      const chatMode = this.data.chatMode;
      const now = Date.now();
      const userRecordId = "record_id" + String(now);
      const botRecordId = "record_id" + String(now + 1);
      const userRecord = {
        content: inputValue,
        record_id: userRecordId,
        role: "user",
        fileList: this.data.sendFileList,
        createTime: now,
        renderKey: `user_${userRecordId}`,
      };
      if (this.data.sendFileList.length) {
        this.setData({
          sendFileList: [],
        });
      }
      const record = {
        content: "",
        record_id: botRecordId,
        role: "assistant",
        hiddenBtnGround: true,
        createTime: now + 1,
        renderKey: `assistant_${botRecordId}`,
      };
      const isWelcomeOnly =
        chatRecords.length === 1 && chatRecords[0].role === "assistant" && chatRecords[0].hiddenBtnGround;
      const baseRecords = isWelcomeOnly ? [] : chatRecords;
      this.setData({
        inputValue: "",
        questions: [],
        chatRecords: [...baseRecords, userRecord, record],
        chatStatus: 1, // 聊天状态切换为1发送中
      });

      // 新增一轮对话记录时 自动往下滚底
      this.autoToBottom();
      if (chatMode === "bot") {
        const cloudInstance = await getCloudInstance(this.data.envShareConfig);
        const ai = cloudInstance.extend.AI;
        const botId = agentConfig.botId || bot.botId;
        let res;
        let isManuallyPaused = false;
        try {
          const current = this.data.conversation || {};
          let conversationId = current.conversationId || "";
          if (conversationId && (/^c-\d+/.test(conversationId) || current.fromServer === false)) {
            conversationId = "";
          }
          const draftTitle = inputValue ? String(inputValue).replace(/\s+/g, " ").trim().slice(0, 20) : "新会话";
          if (!conversationId) {
            conversationId = makeCloudConversationId();
            this.setData({
              conversation: {
                conversationId,
                title: draftTitle,
                fromServer: true,
              },
            });
          }
          const oldLocalId = (this.data.conversation && this.data.conversation.conversationId) || "";
          const fromServer = true;
          let collected = await this.sendYuanqiMessage(ai, botId, inputValue, conversationId, fromServer);
          if (collected && collected.sessionId) {
            conversationId = collected.sessionId;
            this.setData({
              conversation: {
                conversationId,
                title: draftTitle,
                fromServer: true,
              },
            });
            if (oldLocalId && oldLocalId !== conversationId) {
              this.replaceConversationId(oldLocalId, conversationId);
            }
          }
          res = collected;
        } catch (e) {
          const lastValueIndex = this.data.chatRecords.length - 1;
          const errText = formatCloudError(e) || this.data.defaultErrorMsg;
          console.error("[yuanqichat] sendMessage failed", e);
          this.setData({
            chatStatus: 0,
            [`chatRecords[${lastValueIndex}].content`]: errText,
            [`chatRecords[${lastValueIndex}].hiddenBtnGround`]: true,
          });
          return;
        }
        const lastValueIndex = this.data.chatRecords.length - 1;
        const collected = res;
        let contentText = (collected && collected.text) || "";
        if (this.data.chatStatus === 0) {
          isManuallyPaused = true;
        }
        if (contentText && !this.isBusyReply(contentText)) {
          this.setData({
            chatStatus: 3,
            [`chatRecords[${lastValueIndex}].content`]: contentText,
            [`chatRecords[${lastValueIndex}].role`]: "assistant",
          });
        }
        const convId =
          (collected && collected.usedConversationId) ||
          (this.data.conversation && this.data.conversation.conversationId) ||
          "";
        if (convId) {
          this.upsertConversationInList({
            conversationId: convId,
            title: inputValue ? String(inputValue).replace(/\s+/g, " ").trim().slice(0, 20) : "新会话",
            updateTime: Date.now(),
          });
        }
        this.toBottom(40);
        const lastValue = this.data.chatRecords[lastValueIndex] || {};
        lastValue.hiddenBtnGround = isManuallyPaused;
        if (!contentText || this.isBusyReply(contentText)) {
          const debug = [
            collected && collected.error ? collected.error : "",
            contentText && this.isBusyReply(contentText) ? contentText : "",
            `botId=${botId}`,
            `conversationId=${(collected && collected.usedConversationId) || "无"}`,
            `resKeys=${((collected && collected.resKeys) || []).join(",") || "无"}`,
            `chunks=${collected && collected.chunkCount != null ? collected.chunkCount : 0}`,
          ]
            .filter(Boolean)
            .join("\n");
          contentText = debug || this.data.defaultErrorMsg;
          this.setData({
            [`chatRecords[${lastValueIndex}].content`]: contentText,
          });
        }
        // console.log("this.data.chatRecords", this.data.chatRecords);
        this.setData({
          chatStatus: 0,
          [`chatRecords[${lastValueIndex}].hiddenBtnGround`]: isManuallyPaused,
        }); // 对话完成，切回0 ,并且修改最后一条消息的状态，让下面的按钮展示
        this.persistCurrentChat(convId);
        this.resetFetchConversationList().catch((e) => {
          console.log("resetFetchConversationList e", e);
        });
        if (bot.isNeedRecommend && !isManuallyPaused) {
          try {
            const recAi = (await getCloudInstance(this.data.envShareConfig)).extend.AI;
            const chatRecords = this.data.chatRecords;
            const lastPairChatRecord = chatRecords.length >= 2 ? chatRecords.slice(chatRecords.length - 2) : [];
            const recommendRes = await recAi.bot.getRecommendQuestions({
              data: {
                botId: bot.botId,
                history: lastPairChatRecord.map((item) => ({
                  role: item.role,
                  content: item.content,
                })),
                msg: inputValue,
              },
            });
            let result = "";
            for await (let str of recommendRes.textStream) {
              this.toBottom();
              result += str;
              this.setData({
                questions: result.split("\n").filter((item) => !!item),
              });
            }
          } catch (e) {
            console.log("getRecommendQuestions skipped", e);
          }
        }
      }
      if (chatMode === "model") {
        const { modelProvider, quickResponseModel } = modelConfig;
        const cloudInstance = await getCloudInstance(this.data.envShareConfig);
        const ai = cloudInstance.extend.AI;
        const aiModel = ai.createModel(modelProvider);
        const res = await aiModel.streamText({
          data: {
            model: quickResponseModel,
            messages: [
              ...chatRecords.map((item) => ({
                role: item.role,
                content: item.content,
              })),
              {
                role: "user",
                content: inputValue,
              },
            ],
          },
        });
        let contentText = "";
        let reasoningText = "";
        let chatStatus = 2;
        let isManuallyPaused = false;
        let startTime = null; //记录开始思考时间
        let endTime = null; // 记录结束思考时间
        for await (let event of res.eventStream) {
          if (this.data.chatStatus === 0) {
            isManuallyPaused = true;
            break;
          }
          this.toBottom();

          const { data } = event;
          try {
            const dataJson = JSON.parse(data);
            const { id, choices = [] } = dataJson || {};
            const { delta, finish_reason } = choices[0] || {};
            if (finish_reason === "stop") {
              break;
            }
            // console.log('ryan', delta);
            const { content, reasoning_content, role } = delta;
            reasoningText += reasoning_content || "";
            contentText += content || "";
            const newValue = [...this.data.chatRecords];
            const lastValue = newValue[newValue.length - 1];
            lastValue.content = contentText;
            lastValue.reasoning_content = reasoningText;
            lastValue.record_id = "record_id" + String(id);
            if (!!reasoningText && !contentText) {
              // 推理中
              chatStatus = 2;
              if (!startTime) {
                startTime = +new Date();
                endTime = +new Date();
              } else {
                endTime = +new Date();
              }
            } else {
              chatStatus = 3;
            }
            lastValue.thinkingTime = endTime ? Math.floor((endTime - startTime) / 1000) : 0;
            this.setData({ chatRecords: newValue, chatStatus });
          } catch (e) {
            // console.log(e, event)
            break;
          }
        }
        const newValue = [...this.data.chatRecords];
        const lastValue = newValue[newValue.length - 1];
        lastValue.hiddenBtnGround = isManuallyPaused; // 用户手动暂停，不显示下面的按钮
        this.setData({ chatRecords: newValue, chatStatus: 0 }); // 回正
      }
    },
    toBottom: async function (unit) {
      const addUnit = unit === undefined ? 4 : unit;
      if (this.data.shouldAddScrollTop) {
        const newTop = this.data.scrollTop + addUnit;
        if (this.data.manualScroll) {
          this.setData({
            scrollTop: newTop,
          });
        } else {
          this.setData({
            scrollTop: newTop,
            viewTop: newTop,
          });
        }
        return;
      }
      // 只有当内容高度接近scroll 区域视口高度时才开始增加 scrollTop
      // const clientHeight =
      //   this.data.windowInfo.windowHeight - this.data.footerHeight - (this.data.chatMode === "bot" ? 40 : 0); // 视口高度
      const clientHeight = this.data.curScrollHeight; // TODO:
      // const contentHeight =
      //   (await this.calculateContentHeight()) +
      //   (this.data.contentHeightInScrollViewTop || (await this.calculateContentInTop())); // 内容总高度
      const contentHeight = await this.calculateContentHeight();
      // console.log(
      //   'contentHeight clientHeight newTop',
      //   contentHeight,
      //   clientHeight,
      //   this.data.scrollTop + 4
      // );
      if (clientHeight - contentHeight < 10) {
        this.setData({
          shouldAddScrollTop: true,
        });
      }
    },
    copyChatRecord: function (e) {
      const { content } = e.currentTarget.dataset;
      wx.setClipboardData({
        data: content,
        success: function (res) {
          wx.showToast({
            title: "复制成功",
            icon: "success",
          });
        },
      });
    },
    addFileList: function () {
      // 顶部文件行展现时，隐藏底部工具栏
      this.setData({});
    },
    subFileList: function () { },
    copyUrl: function (e) {
      const { url } = e.currentTarget.dataset;
      console.log(url);
      wx.setClipboardData({
        data: url,
        success: function (res) {
          wx.showToast({
            title: "复制成功",
            icon: "success",
          });
        },
      });
    },
    handleRemoveChild: function (e) {
      // console.log("remove", e.detail.tempId);
      if (e.detail.tempId) {
        const newSendFileList = this.data.sendFileList.filter((item) => item.tempId !== e.detail.tempId);
        console.log("newSendFileList", newSendFileList);
        this.setData({
          sendFileList: newSendFileList,
        });
        if (newSendFileList.length === 0 && this.data.showFileList) {
          this.setData({
            showFileList: false,
          });
        }
      }
    },
    handleChangeChild: function (e) {
      console.log("change", e.detail);
      const { fileId, tempId, status } = e.detail;
      // const curFile = this.data.sendFileList.find(item => item.tempId === tempId)
      // curFile.fileId = fileId
      const newSendFileList = this.data.sendFileList.map((item) => {
        if (item.tempId === tempId) {
          const obj = {};
          if (fileId) {
            obj.fileId = fileId;
          }
          if (status) {
            obj.status = status;
          }
          return {
            ...item,
            ...obj,
          };
        }
        return item;
      });
      this.setData({
        sendFileList: newSendFileList,
      });
    },
    handleClickTools: function () {
      this.setData({
        showTools: !this.data.showTools,
      });
    },
    handleClickWebSearch: function () {
      if (!this.data.useWebSearch && !this.data.bot.searchEnable) {
        wx.showModal({
          title: "提示",
          content: "请前往腾讯云开发平台启用 Agent 联网搜索功能",
        });
        return;
      }
      if (this.data.sendFileList.length) {
        wx.showModal({
          title: "提示",
          content: "上传附件后不支持联网搜索",
        });
        return;
      }
      this.setData({
        useWebSearch: !this.data.useWebSearch,
      });
    },
    fetchAudioUrlByContent: async function (recordId, content) {
      // 缓存有读缓存
      if (this.data.audioSrcMap[recordId]) {
        return this.data.audioSrcMap[recordId];
      }
      // 发起文本转语音请求
      const res = await new Promise((resolve, reject) => {
        commonRequest({
          path: `bots/${this.data.bot.botId}/text-to-speech`,
          header: {},
          data: {
            text: content,
            voiceType: this.data.bot.voiceSettings?.outputType,
          },
          method: "POST",
          success: (res) => {
            resolve(res);
          },
          fail(e) {
            console.log("create text-to-speech task e", e);
            reject(e);
          },
        });
      });
      const { data } = res;
      if (data && data.TaskId) {
        const taskId = data.TaskId;
        // 轮训获取音频url
        let loopQueryStatus = true;
        let audioUrl = "";
        while (loopQueryStatus) {
          const res = await new Promise((resolve, reject) => {
            commonRequest({
              path: `bots/${this.data.bot.botId}/text-to-speech`,
              header: {},
              data: {
                taskId,
              },
              method: "GET",
              success: (res) => {
                resolve(res);
              },
              fail(e) {
                console.log("create text-to-speech task e", e);
                reject(e);
              },
            });
          });
          const { data } = res;
          if (data.code || data.Status === 2) {
            loopQueryStatus = false;
          }
          if (data.Status === 2) {
            audioUrl = data.ResultUrl;
            this.setData({
              audioSrcMap: {
                ...this.data.audioSrcMap,
                [recordId]: audioUrl,
              },
            });
          }
          if (loopQueryStatus) {
            await sleep(1000);
          }
        }
        return audioUrl;
      }
      return "";
    },
    handlePlayAudio: async function (e) {
      console.log("handlePlayAudio e", e);
      // 判断是否打开语音能力
      if (!this.data.bot.voiceSettings?.enable) {
        wx.showModal({
          title: "提示",
          content: "请前往腾讯云开发平台启用语音输入输出能力",
        });
        return;
      }

      const { recordid: botRecordId, content } = e.target.dataset;
      const audioContext = this.data.audioContext;
      if (audioContext.context) {
        // 判断当前管理的 audioContext 所属 chatRecord 是否与点击播放的 chatRecord 一致
        if (audioContext.recordId === botRecordId) {
          // 是则直接播放
          audioContext.playStatus = 2;
          audioContext.showSpeedList = false;
          // audioContext.currentSpeed = 1.25;
          this.setData({
            audioContext: audioContext,
          });
          audioContext.context.playbackRate = audioContext.currentSpeed;
          audioContext.context.play();
        } else {
          // 需销毁当前的 audioContext TODO:, 先测试复用content, 直接更换src
          audioContext.context.stop(); // 旧的停止
          audioContext.recordId = botRecordId;
          audioContext.playStatus = 1;
          audioContext.showSpeedList = false;
          audioContext.currentSpeed = 1.25;
          this.setData({
            audioContext: {
              ...audioContext,
            },
          });
          const audioUrl = await this.fetchAudioUrlByContent(botRecordId, content);
          if (audioUrl) {
            audioContext.context.src = audioUrl;
            audioContext.context.seek(0); // 播放进度拉回到0
            audioContext.context.playbackRate = audioContext.currentSpeed;
            audioContext.context.play();
            this.setData({
              audioContext: {
                ...audioContext,
                playStatus: 2,
              },
            });
          } else {
            console.log("文本转语音失败");
            this.setData({
              audioContext: {
                ...audioContext,
                playStatus: 0,
              },
            });
          }
        }
      } else {
        // 创建audioContext
        const audioContext = {
          recordId: botRecordId,
          playStatus: 1,
          showSpeedList: false,
          currentSpeed: 1.25,
        };
        const innerAudioContext = wx.createInnerAudioContext({
          useWebAudioImplement: false, // 是否使用 WebAudio 作为底层音频驱动，默认关闭。对于短音频、播放频繁的音频建议开启此选项，开启后将获得更优的性能表现。由于开启此选项后也会带来一定的内存增长，因此对于长音频建议关闭此选项
        });
        try {
          await wx.setInnerAudioOption({
            obeyMuteSwitch: false, // 是否遵循系统静音开关，默认遵循
          });
        } catch (e) {
          console.log("不遵循静音模式控制", e);
        }
        innerAudioContext.onEnded(() => {
          // 音频自然播放至结束触发
          this.setData({
            audioContext: {
              ...this.data.audioContext,
              playStatus: 0,
            },
          });
        });
        audioContext.context = innerAudioContext;
        this.setData({
          audioContext: audioContext,
        });
        const audioUrl = await this.fetchAudioUrlByContent(botRecordId, content);
        if (audioUrl) {
          audioContext.context.src = audioUrl;
          audioContext.context.playbackRate = audioContext.currentSpeed; // 播放速率，范围 0.5~2.0，默认 1.0
          audioContext.context.play();
          this.setData({
            audioContext: {
              ...audioContext,
              playStatus: 2,
            },
          });
        } else {
          console.log("文本转语音失败");
          this.setData({
            audioContext: {
              ...audioContext,
              playStatus: 0,
            },
          });
        }
      }
    },
    handlePauseAudio: function (e) {
      console.log("handlePauseAudio e", e);
      const { recordid: botRecordId } = e.target.dataset;
      const audioContext = this.data.audioContext;
      if (botRecordId === audioContext.recordId && audioContext.context) {
        audioContext.context.pause();
        audioContext.playStatus = 0;
        this.setData({
          audioContext: {
            ...audioContext,
          },
        });
      } else {
        console.log("暂停异常");
      }
    },
    toggleSpeedList(e) {
      this.setData({
        audioContext: {
          ...this.data.audioContext,
          showSpeedList: !this.data.audioContext.showSpeedList,
        },
      });
    },
    chooseSpeed(e) {
      const speed = e.currentTarget.dataset.speed;
      const audioContext = this.data.audioContext;
      audioContext.showSpeedList = !this.data.audioContext.showSpeedList;
      audioContext.currentSpeed = Number(speed);
      audioContext.context.pause();
      audioContext.context.playbackRate = audioContext.currentSpeed;
      audioContext.context.play();
      this.setData({
        audioContext: {
          ...this.data.audioContext,
          ...audioContext,
        },
      });
    },
    // 触摸开始
    handleTouchStart(e) {
      if (this.data.chatStatus !== 0 || this.data.voiceRecognizing === true) {
        wx.showToast({
          title: "请等待对话完成",
          icon: "error",
        });
        return;
      }
      console.log("touchstart e", e);
      const { clientY } = e.touches[0];
      this.setData({
        startY: clientY,
        longPressTriggered: false,
      });

      // 设置长按定时器（500ms）
      this.data.longPressTimer = setTimeout(() => {
        // 触发长按，同时进入待发送态
        this.setData({ longPressTriggered: true, sendStatus: 1 });
        // 这里可添加长按反馈（如震动）
        wx.vibrateShort();
        this.startRecord();
      }, 300);
    },
    // 触摸移动
    handleTouchMove(e) {
      if (this.data.chatStatus !== 0 || this.data.voiceRecognizing === true) {
        wx.showToast({
          title: "请等待对话完成",
          icon: "error",
        });
        return;
      }
      if (!this.data.longPressTriggered) return;
      const { clientY } = e.touches[0];
      const deltaY = clientY - this.data.startY;
      // 计算垂直滑动距离
      if (Math.abs(deltaY) > this.data.moveThreshold) {
        // 滑动超过阈值时置为待取消态
        // clearTimeout(this.data.longPressTimer);
        console.log("touchMove 待取消");
        if (this.data.sendStatus !== 2) {
          this.setData({ sendStatus: 2 });
        }
      } else {
        console.log("touchMove 待发送");
        if (this.data.sendStatus !== 1) {
          this.setData({ sendStatus: 1 });
        }
      }
    },
    // 触摸结束
    handleTouchEnd(e) {
      if (this.data.chatStatus !== 0 || this.data.voiceRecognizing === true) {
        wx.showToast({
          title: "请等待对话完成",
          icon: "error",
        });
        return;
      }
      console.log("touchEnd e", e);
      clearTimeout(this.data.longPressTimer);
      if (this.data.longPressTriggered) {
        const { clientY } = e.changedTouches[0];
        const deltaY = clientY - this.data.startY;
        // 判断是否向上滑动超过阈值
        if (deltaY < -this.data.moveThreshold) {
          this.cancelSendVoice(); // 执行滑动后的逻辑
        } else {
          this.sendVoice(); // 执行普通松开逻辑
        }
      }
      this.setData({ longPressTriggered: false });
    },
    sendVoice() {
      // 发送语音消息
      console.log("发送语音");
      if (this.data.recorderManager) {
        this.setData({
          sendStatus: 3,
          voiceRecognizing: true,
        });
        this.data.recorderManager.stop();
      }
    },
    cancelSendVoice() {
      // 取消语音发送
      console.log("取消发送");
      if (this.data.recorderManager) {
        this.setData({
          sendStatus: 4,
        });
        console.log("停止录音");
        this.data.recorderManager.stop();
      }
    },
    startRecord() {
      console.log("startRecord sendStatus", this.data.sendStatus);
      if (this.data.recorderManager && this.data.sendStatus === 1) {
        console.log("开始录音");
        this.data.recorderManager.start(this.data.recordOptions);
      }
    },
    handleUserMessage: function (message) {
      const { inputValue } = this.data;
      const content = message || inputValue;
      const userMsg = { id: "user_message_" + Date.now(), role: "user", content };
      // 为了保证格式统一，返回数组
      return [userMsg];
    },
    handleFrontendToolCallMessage: function (frontendToolsResult) {
      const toolCallMessages = frontendToolsResult.map((item) => ({
        id: item.toolCallId,
        role: "tool",
        toolCallId: item.toolCallId,
        content: item.result,
      }));
      return toolCallMessages;
    },
    handleSendMessageV2: async function (message) {
      const userMessages = this.handleUserMessage(message);
      this.setData({
        chatStatus: 1, // 状态：生成中
        inputValue: "",
        questions: [],
      });
      await this.sendMessageV2(userMessages);
      this.setData({
        chatStatus: 0,
      });
      this.persistCurrentThread();
    },
    // 传进来的消息有三种，用户输入，前端工具调用结果，人机交互中断，目前不支持人机交互中断
    sendMessageV2: async function (message) {
      const {
        agentV2Config: { agentID },
        messages,
        threadId,
      } = this.data;
      // 1. UI 预处理,如果是用户消息,则添加一个 AI 占位消息
      const newMessages = [...messages];
      if (message?.[0]?.role === "user") {
        const aiMsg = { id: "assistant_message_" + Date.now(), role: "assistant", parts: [] };
        newMessages.push(message?.[0], aiMsg);
        this.setData({
          messages: newMessages,
        });
      }
      // 记录当前 AI 消息的索引，后续只更新这一条
      const currentAiMsgIndex = newMessages.length - 1;
      const cloudInstance = await getCloudInstance();
      const ai = cloudInstance.extend.AI;
      // 2.发起初始请求
      const payload = {
        botId: agentID,
        threadId: threadId,
        runId: "run_id_" + Date.now(),
        messages: message,
        tools: (this.data.agentV2Config.tools || []).map((item) => ({
          name: item.name,
          description: item.description,
          parameters: item.parameters,
        })),
        context: [],
        state: {},
      };
      console.log("[yuanqichat] sendMessage", payload);
      try {
        const res = await ai.bot.sendMessage({
          data: payload,
        });
        console.log("[yuanqichat] sendMessage ok", res && Object.keys(res));
        // 3.进入流处理循环
        await this.handleStream(res.eventStream, ai, agentID, currentAiMsgIndex);
      } catch (e) {
        const errText = formatCloudError(e);
        console.error("[yuanqichat] sendMessage failed", e, errText);
        this.setData({
          [`messages[${currentAiMsgIndex}].parts`]: [
            { type: "error", content: `调用失败：${errText}` },
          ],
        });
      }
    },
    handleStream: async function (stream, ai, agentID, currentAiMsgIndex) {
      let fullContent = "";
      const currentParts = this.data.messages[currentAiMsgIndex].parts;
      let eventIndex = 0;
      if (!stream) {
        throw new Error("eventStream 为空，Agent 没有返回流");
      }
      for await (let event of stream) {
        // 被中断直接返回
        if (this.data.chatStatus === 0) {
          return;
        }
        this.toBottom();
        if (eventIndex < 8) {
          console.log("[yuanqichat] stream event", eventIndex, event);
        }
        eventIndex += 1;

        let data = event && event.json;
        if (!data && event && event.data != null) {
          if (event.data === "[DONE]") {
            break;
          }
          try {
            data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          } catch (e) {
            console.log("[yuanqichat] parse event.data failed", event.data);
            continue;
          }
        }
        if (!data) {
          console.log("[yuanqichat] empty event", event);
          continue;
        }

        const isAgui =
          data.type &&
          (String(data.type).indexOf("TEXT_") === 0 ||
            String(data.type).indexOf("TOOL_") === 0 ||
            String(data.type).indexOf("RUN_") === 0);

        // 兼容 yuanqichat / 元器 IBot 的经典 SSE：{ type: "text", content: "..." }
        if (!isAgui && (data.content != null || data.type === "text")) {
          const chunk = data.content || "";
          if (!chunk) {
            continue;
          }
          const lastPart = currentParts[currentParts.length - 1];
          if (!lastPart || lastPart.type !== "text") {
            fullContent = chunk;
            currentParts.push({ type: "text", content: fullContent, id: "classic_" + Date.now() });
            this.setData({
              [`messages[${currentAiMsgIndex}].parts`]: currentParts,
            });
          } else {
            fullContent += chunk;
            this.setData({
              [`messages[${currentAiMsgIndex}].parts[${currentParts.length - 1}].content`]: fullContent,
            });
          }
          continue;
        }

        switch (data.type) {
          // 普通文本输出开始，push 一个 text 类型的 part
          case "TEXT_MESSAGE_START":
            fullContent = "";
            const textPart = { type: "text", content: fullContent, id: data.messageId };
            currentParts.push(textPart);
            this.setData({
              [`messages[${currentAiMsgIndex}].parts`]: currentParts,
            });
            break;

          // 文本内容累加
          case "TEXT_MESSAGE_CONTENT":
            fullContent += data.delta || "";
            this.setData({
              [`messages[${currentAiMsgIndex}].parts[${currentParts.length - 1}].content`]: fullContent,
            });
            break;
          // 工具调用开始，push 一个 tool_call 类型的 part
          case "TOOL_CALL_START":
            fullContent = "";
            const toolCallPart = {
              type: "tool_call",
              toolCallName: data.toolCallName,
              id: data.toolCallId,
              arguments: fullContent,
              status: "running",
            };
            currentParts.push(toolCallPart);
            this.setData({
              [`messages[${currentAiMsgIndex}].parts`]: currentParts,
            });
            break;
          // 工具调用参数累加
          case "TOOL_CALL_ARGS":
            fullContent += data.delta || "";
            this.setData({
              [`messages[${currentAiMsgIndex}].parts[${currentParts.length - 1}].arguments`]: fullContent,
            });
            break;
          // 更新服务端工具调用结果
          case "TOOL_CALL_RESULT":
            const toolCallId = data.toolCallId;
            // 收到服务端工具调用的结果，更新工具调用状态，并且要求工具调用必须是 running 状态
            const toolCallIndex = currentParts.findIndex(
              (item) => item.id === toolCallId && item.type === "tool_call" && item.status === "running"
            );
            if (toolCallIndex === -1) {
              continue;
            }
            this.setData({
              [`messages[${currentAiMsgIndex}].parts[${toolCallIndex}].status`]: "success",
            });
            this.setData({
              [`messages[${currentAiMsgIndex}].parts[${toolCallIndex}].result`]: data.content,
            });
            break;
          case "RUN_ERROR":
            console.error("[yuanqichat] RUN_ERROR", data);
            const agentErrorPart = {
              type: "error",
              content: data.message || data.content || "agent 出错了，请稍后再试",
            };
            currentParts.push(agentErrorPart);
            this.setData({
              [`messages[${currentAiMsgIndex}].parts`]: currentParts,
            });
            // agent 运行错误直接返回
            return;
          default:
            break;
        }
      }
      // 4. 处理工具调用
      // 过滤出状态为 running 的工具调用，这里会同时收集到前端和后端工具调用
      const toolCalls = currentParts.filter((part) => part.type === "tool_call" && part.status === "running");
      // 如果有工具调用，处理工具调用
      if (toolCalls.length > 0) {
        // 收集所有工具调用的结果，未找到工具或者调用失败都应该发回服务端
        const frontendToolsResult = [];
        for (const toolCall of toolCalls) {
          const { toolCallName, arguments: args, id: toolCallId } = toolCall;
          // 根据工具调用名称找到对应的前端工具
          const tool = this.data.agentV2Config.tools.find((item) => item.name === toolCallName);
          // 只处理前端工具调用
          if (tool) {
            try {
              // 调用工具处理函数
              const toolResult = await tool.handler(JSON.parse(args));
              // 处理成字符串
              const toolResultStr = JSON.stringify(toolResult);
              // 调用成功，将结果添加到前端工具调用结果数组
              frontendToolsResult.push({
                toolCallId,
                result: toolResultStr,
              });
              // 更新工具调用状态为 success
              this.setData({
                [`messages[${currentAiMsgIndex}].parts[${currentParts.findIndex(
                  (item) => item.id === toolCallId
                )}].status`]: "success",
              });
              this.setData({
                [`messages[${currentAiMsgIndex}].parts[${currentParts.findIndex(
                  (item) => item.id === toolCallId
                )}].result`]: toolResultStr,
              });
            } catch (e) {
              frontendToolsResult.push({
                toolCallId,
                result: `工具${toolCallName}调用失败：${e.message}`,
              });
              // 更新工具调用状态为 failed
              this.setData({
                [`messages[${currentAiMsgIndex}].parts[${currentParts.findIndex(
                  (item) => item.id === toolCallId
                )}].status`]: "failed",
              });
              this.setData({
                [`messages[${currentAiMsgIndex}].parts[${currentParts.findIndex(
                  (item) => item.id === toolCallId
                )}].result`]: e.message,
              });
            }
          }
        }
        // 处理工具调用结果，发送给服务端
        const toolCallMessages = this.handleFrontendToolCallMessage(frontendToolsResult);
        // 递归调用 sendMessageV2，直至本轮会话结束
        await this.sendMessageV2(toolCallMessages);
      }
    },
  },
});
