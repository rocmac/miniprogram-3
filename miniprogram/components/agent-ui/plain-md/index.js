const stripInline = (value) => {
  return String(value || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
};

const splitMarkdownBlocks = (markdown) => {
  const src = String(markdown || "").replace(/\r\n/g, "\n");
  if (!src) return [];
  const blocks = [];
  const lines = src.split("\n");
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const text = stripInline(buf.join("\n")).replace(/^\n+|\n+$/g, "");
    buf = [];
    if (text) {
      blocks.push({ i: blocks.length, type: "p", text });
    }
  };
  lines.forEach((line) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        i: blocks.length,
        type: "h" + Math.min(heading[1].length, 4),
        text: stripInline(heading[2]),
      });
      return;
    }
    if (!line.trim()) {
      flush();
      return;
    }
    buf.push(line);
  });
  flush();
  return blocks;
};

Component({
  properties: {
    markdown: {
      type: String,
      value: "",
    },
  },
  data: {
    blocks: [],
  },
  observers: {
    markdown(value) {
      this.setData({ blocks: splitMarkdownBlocks(value) });
    },
  },
});
