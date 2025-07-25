module.exports = {
  name: "My react",
  getUserPrompt: ({ fileContent, inlineComments, extraction }) => {
    if (extraction) {
      return `Extract comments from: ${fileContent}`;
    } else if (inlineComments) {
      return `Process with inline comments: ${fileContent}`;
    } else {
      return `I am a test prompt! Content: ${fileContent}`;
    }
  },
  getSystemPrompt: () => "I am a system prompt!",
};
