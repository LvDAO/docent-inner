export const chatEn = {
  'chat.transcript.title': 'Transcript Chat',
  'chat.transcript.description': 'Ask questions about the transcript (⌘K)',
  'chat.suggestion.summarize.label': 'Summarize',
  'chat.suggestion.summarize.prompt': 'Summarize the transcript succinctly.',
  'chat.suggestion.explainMistakes.label': 'Explain mistakes',
  'chat.suggestion.explainMistakes.prompt':
    'Explain mistakes the agent made, if there are any.',
  'chat.suggestion.unusualBehavior.label': 'Identify unusual behavior',
  'chat.suggestion.unusualBehavior.prompt':
    'Identify any unusual or unexpected behavior on the part of the agent.',
  'chat.suggestion.devilsAdvocate.label': "Play devil's advocate",
  'chat.suggestion.devilsAdvocate.prompt':
    "Play devil's advocate. Is there a reasonable case to be made that the judge result is incorrect?",
  'chat.suggestion.judgeContext.label': 'Provide context for judge result',
  'chat.suggestion.judgeContext.prompt':
    'Summarize the context leading up to the behavior relevant to the rubric.',
  'chat.suggestion.explainJudge.label': 'Explain judge result in more detail',
  'chat.suggestion.explainJudge.prompt':
    'Walk through the rubric step by step and explain why the judge produced this result.',
  'chat.context.exceeded': 'Context window exceeded.',
  'chat.context.tryDifferentModel':
    'Context window exceeded. Try a different model.',

  'chat.header.title': 'Chat',
  'chat.header.description': 'Ask questions about the transcript',
  'chat.header.clearHistory': 'Clear chat history',
  'chat.thinking': 'Thinking...',
  'chat.input.placeholder': 'Send a message...',
  'chat.input.retry': 'Retry',
  'chat.input.send': 'Send message',
  'chat.input.cancel': 'Stop generating',
  'chat.input.sending': 'Generating response',
  'chat.input.scrollToBottom': 'Scroll to bottom',

  'chat.model.select': 'Select model',
  'chat.model.search': 'Search models...',
  'chat.model.empty': 'No models found',
  'chat.model.byok': 'This model uses your own API key',
  'chat.model.reasoningEffort': '{effort} reasoning effort',

  'chat.tool.callId': 'Tool Call ID: {id}',
  'chat.tool.message': 'Tool Message',
  'chat.tool.error': 'Error: {message}',
  'chat.selection.remove': 'Remove selection',
  'chat.selection.removeFailed': 'Failed to remove selection',

  'chat.refinement.labels': 'Labels',
  'chat.refinement.toggleLabels':
    'Toggle whether the agent sees labels in context.',
  'chat.refinement.noLabels': 'No labels found.',
  'chat.refinement.retryFailed': 'Failed to retry last message',
  'chat.refinement.cancelFailed': 'Failed to cancel refinement session',
  'chat.refinement.title': 'Refinement Chat',
  'chat.refinement.description': 'Chat with an agent to refine the rubric (⌘J)',

  'chat.search.placeholder':
    'Describe an agent behavior you want to explore...',
  'chat.search.direct': 'Direct search',
  'chat.search.guided': 'Guided search',
  'chat.search.title': 'Create a rubric',
  'chat.search.description':
    'Find and explore occurrences of an agent behavior',
  'chat.search.tryPreset': 'Try a preset:',
  'chat.search.readOnly':
    "This search box is disabled because you're in read-only mode",
  'chat.search.scaffolding.label': 'Scaffolding issues',
  'chat.search.scaffolding.prompt':
    'potential issues with the environment the agent is operating in',
  'chat.search.strangeBehavior.label': 'Strange behaviors',
  'chat.search.strangeBehavior.prompt':
    'cases where the agent acted in a strange or unexpected way',
  'chat.search.disobeyingPrompt.label': 'Disobeying prompt',
  'chat.search.disobeyingPrompt.prompt':
    'cases where the agent did not follow instructions given to it or directly disobeyed them',
} as const;

export const chatZhCN = {
  'chat.transcript.title': '对话记录分析',
  'chat.transcript.description': '针对这段对话记录提问（⌘K）',
  'chat.suggestion.summarize.label': '简要总结',
  'chat.suggestion.summarize.prompt': '简洁总结这段对话记录。',
  'chat.suggestion.explainMistakes.label': '分析错误',
  'chat.suggestion.explainMistakes.prompt': '说明智能体犯下的错误（如有）。',
  'chat.suggestion.unusualBehavior.label': '找出异常行为',
  'chat.suggestion.unusualBehavior.prompt':
    '找出智能体任何异常或出乎意料的行为。',
  'chat.suggestion.devilsAdvocate.label': '从反方角度审视',
  'chat.suggestion.devilsAdvocate.prompt':
    '从反方角度审视该判断。是否有合理理由认为裁判结果不正确？',
  'chat.suggestion.judgeContext.label': '补充裁判结果的上下文',
  'chat.suggestion.judgeContext.prompt':
    '总结与此评估准则相关行为发生前的上下文。',
  'chat.suggestion.explainJudge.label': '详细解释裁判结果',
  'chat.suggestion.explainJudge.prompt':
    '逐步分析评估准则，并详细解释裁判为何得出该结果。',
  'chat.context.exceeded': '已超出上下文窗口。',
  'chat.context.tryDifferentModel': '已超出上下文窗口，请尝试其他模型。',

  'chat.header.title': '对话',
  'chat.header.description': '针对这段对话记录提问',
  'chat.header.clearHistory': '清空对话记录',
  'chat.thinking': '正在思考…',
  'chat.input.placeholder': '输入消息…',
  'chat.input.retry': '重试',
  'chat.input.send': '发送消息',
  'chat.input.cancel': '停止生成',
  'chat.input.sending': '正在生成回复',
  'chat.input.scrollToBottom': '滚动到底部',

  'chat.model.select': '选择模型',
  'chat.model.search': '搜索模型…',
  'chat.model.empty': '未找到模型',
  'chat.model.byok': '此模型使用你自己的 API 密钥',
  'chat.model.reasoningEffort': '推理强度：{effort}',

  'chat.tool.callId': '工具调用 ID：{id}',
  'chat.tool.message': '工具消息',
  'chat.tool.error': '错误：{message}',
  'chat.selection.remove': '移除所选内容',
  'chat.selection.removeFailed': '移除所选内容失败',

  'chat.refinement.labels': '标签',
  'chat.refinement.toggleLabels': '切换是否在上下文中向智能体显示标签。',
  'chat.refinement.noLabels': '未找到标签。',
  'chat.refinement.retryFailed': '重试上一条消息失败',
  'chat.refinement.cancelFailed': '取消准则优化会话失败',
  'chat.refinement.title': '准则优化对话',
  'chat.refinement.description': '与智能体对话以优化评估准则（⌘J）',

  'chat.search.placeholder': '描述你希望探索的智能体行为…',
  'chat.search.direct': '直接搜索',
  'chat.search.guided': '引导式搜索',
  'chat.search.title': '创建评估准则',
  'chat.search.description': '查找并探索智能体行为的出现情况',
  'chat.search.tryPreset': '试试预设：',
  'chat.search.readOnly': '当前为只读模式，无法使用此搜索框',
  'chat.search.scaffolding.label': '脚手架问题',
  'chat.search.scaffolding.prompt': '智能体运行环境或脚手架中可能存在的问题',
  'chat.search.strangeBehavior.label': '异常行为',
  'chat.search.strangeBehavior.prompt': '智能体采取了奇怪或非预期行为的情况',
  'chat.search.disobeyingPrompt.label': '不遵循指令',
  'chat.search.disobeyingPrompt.prompt':
    '智能体没有遵循给定指令或直接违背指令的情况',
} satisfies Record<keyof typeof chatEn, string>;
