const zhCN = {
  // App-level
  app: {
    name: 'Firewood',
  },

  // Sidebar
  sidebar: {
    showAll: '全部显示',
    hideAll: '全部隐藏',
  },

  // Tool names
  toolName: {
    'json-formatter': 'JSON 格式化',
    'timestamp': '时间戳转换',
    'text-diff': '文本对比',
    'notepad': '记事本',
    'base64-codec': 'Base64 编解码',
    'url-codec': 'URL 编解码',
    'hash': 'Hash 计算',
    'img-to-pdf': '图片排版',
    'translate': '文本翻译',
  },

  // Tool descriptions
  toolDesc: {
    'json-formatter': 'JSON 格式化、压缩与校验',
    'timestamp': 'Unix 时间戳与日期互转',
    'text-diff': '逐行比较两段文本的差异',
    'notepad': '本地多标签记事（支持新建与关闭标签）',
    'base64-codec': 'Base64 编码与解码',
    'url-codec': 'URL 编码与解码',
    'hash': '计算文本或文件的 MD5 / SHA-1 / SHA-256',
    'img-to-pdf': '多图排版，导出为 A4 尺寸 PDF',
    'translate': '支持腾讯云 / 百度翻译 API',
  },

  // Common actions
  action: {
    format: '格式化',
    minify: '压缩',
    unescape: '去除转义',
    clear: '清空',
    convert: '转 换',
    compare: '对比',
    restoreEdit: '恢复编辑视图',
    encode: '编码',
    decode: '解码',
    swap: '互换',
    calculate: '计算',
    copy: '复制',
    copied: '已复制',
    rename: '重命名',
    cancel: '取消',
    ok: '确定',
    save: '保存',
    delete: '删除',
    translate: '翻 译',
    showOriginalInput: '显示原始输入',
    hideOriginalInput: '隐藏原始输入',
  },

  // Common labels
  label: {
    result: '结果',
    file: '文件',
    text: '文本',
    original: '原文',
    modified: '修改后',
    seconds: '秒',
    milliseconds: '毫秒',
    timestamp: '时间戳',
    date: '日期',
    algorithm: '算法',
    hashValue: '哈希值',
    settings: '设置',
    language: '语言',
  },

  // Font size control
  fontSizeControl: {
    decrease: '缩小字体',
    increase: '放大字体',
  },

  // JSON Formatter
  jsonFormatter: {
    title: 'JSON 格式化',
    description: 'JSON 格式化、压缩与语法校验',
  },

  // Timestamp
  timestamp: {
    title: '时间戳转换',
    description: 'Unix 时间戳与人类可读日期互转',
    tsToDate: '时间戳 → 日期',
    dateToTs: '日期 → 时间戳',
    enterTs: '输入 Unix 时间戳',
    selectDate: '选择日期',
    currentTime: '当前时间',
    currentDate: '当前日期',
    history: '转换历史',
    noHistory: '暂无转换记录',
    tsToDateTag: '时间戳转日期',
    dateToTsTag: '日期转时间戳',
    copyDetails: '复制转换详情',
    formatCopyTsToDate: '时间戳 → 日期',
    formatCopyDateToTs: '日期 → 时间戳',
    formatCopyDate: '日期',
    formatCopyTs: '时间戳',
  },

  // Text Diff
  textDiff: {
    title: '文本对比',
    description: '对比两段文本的差异',
    enterOriginal: '请输入原始文本...',
    enterModified: '请输入修改后文本...',
    added: '新增',
    deleted: '删除',
    foldLines: '显示 {{count}} 行未变化内容',
    unfoldLines: '收起 {{count}} 行未变化内容',
  },

  // Notepad
  notepad: {
    title: '记事本',
    description: '本地多标签记事（支持新建与关闭标签）',
    untitled: '未命名',
    newTab: '新建标签',
    deleteTab: '删除标签页',
    confirmDelete: '确定要删除「{{name}}」吗？删除后内容无法恢复。',
    maxTabs: '最多只能创建 {{count}} 个标签页',
    tabName: '标签名称',
    enterName: '请输入标签名称',
    formatJson: '格式化 JSON',
    chars: '字符',
    selected: '选中',
    line: '行',
    maxNameLength: '文件名最多 {{count}} 个字符',
    namePlaceholder: '例如：需求记录.md',
  },

  // Base64
  base64: {
    title: 'Base64 编解码',
    description: '文本 Base64 编码与解码',
    enterPlainText: '请输入原始文本...',
    enterBase64: '请输入 Base64 字符串...',
    resultPlaceholder: '结果...',
    decodeFailed: '解码失败，请检查输入是否为合法的 Base64 字符串',
  },

  // URL Codec
  urlCodec: {
    title: 'URL 编解码',
    description: 'URLEncode / URLDecode',
    enterUrl: '请输入原始 URL...',
    enterEncoded: '请输入 URL 编码字符串...',
    resultPlaceholder: '结果...',
    decodeFailed: '解码失败，请检查输入是否为合法的 URL 编码字符串',
  },

  // Hash
  hash: {
    title: 'Hash 计算',
    description: '计算文件或文本的 MD5 / SHA-1 / SHA-256',
    enterText: '请输入要计算哈希值的文本...',
    dropFile: '点击选择文件，或将文件拖拽到此处',
    supportAllTypes: '支持任意类型文件',
    calculating: '正在计算哈希值…',
    readFailed: '有 {{count}} 张图片读取失败',
  },

  // Image to PDF
  imgToPdf: {
    title: '图片排版',
    description: '选择图片，设定每页布局，一键导出为 A4 尺寸 PDF',
    addImages: '添加图片',
    clickOrDrag: '点击或拖拽，支持批量',
    imageCount: '{{count}} 张图片 · 拖拽排序',
    perPage: '每页',
    images: '张',
    layout: '排列',
    vertical: '上下',
    horizontal: '左右',
    imageScale: '图片缩放',
    pageMargin: '页面留白',
    uniformScale: '双图同倍率',
    phonePreset: '手机照片推荐',
    receiptPreset: '证件/票据模式',
    resetDefault: '恢复默认',
    sizeLimit: '输出大小限制',
    sizePlaceholder: '如 2.5M',
    sizeHint: '留空不限制；设定后自动压缩图片质量以控制文件大小',
    exportPdf: '导出 PDF · {{count}} 页',
    previewHint: '添加图片后预览排版效果',
    pdfSaved: 'PDF 已保存',
    generateFailed: '生成失败：{{error}}',
    addImagesFirst: '请先添加图片',
    minSize: 'PDF 最小可压缩至 {{size}}MB，无法达到目标大小',
    actualSize: '实际大小 {{size}}MB',
    pdfFilter: 'PDF 文件',
    previewTip: '预览与导出使用同一套缩放与留白参数',
    remove: '移除',
  },

  // Translate
  translate: {
    title: '文本翻译',
    description: '支持腾讯云 / 百度翻译 API',
    engine: '翻译引擎',
    tencent: '腾讯翻译',
    baidu: '百度翻译',
    swapLang: '交换语言',
    collapseConfig: '收起配置',
    apiConfig: 'API 配置',
    sourceText: '原文',
    targetText: '译文',
    enterText: '输入要翻译的文本…',
    translationResult: '翻译结果',
    configureKeys: '请先配置 API 密钥',
    history: '翻译历史',
    noHistory: '暂无翻译记录',
    copyDetails: '复制翻译详情',
    tencentGuide: '前往 {link} 页面获取 SecretId 和 SecretKey（每月免费额度 500 万字符）',
    tencentLink: '腾讯云 API 密钥管理',
    baiduGuide: '前往 {link} 页面获取 APPID 和密钥（标准版每月免费 5 万字符）',
    baiduLink: '百度翻译开放平台 → 开发者信息',
    secretLabel: '密钥',
  },

  // Languages
  lang: {
    zh: '中文',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    fr: '法语',
    de: '德语',
    es: '西班牙语',
    ru: '俄语',
    pt: '葡萄牙语',
    it: '意大利语',
    vi: '越南语',
    th: '泰语',
    ar: '阿拉伯语',
    auto: '自动检测',
  },

  // Tencent regions
  region: {
    'ap-guangzhou': '广州',
    'ap-shanghai': '上海',
    'ap-beijing': '北京',
    'ap-chengdu': '成都',
    'ap-hongkong': '香港',
  },

  // About dialog
  about: {
    subtitle: '一个紧凑的工具箱，让日常开发工作流更高效。',
    viewChanges: '查看修改点',
    releaseNotesTitle: '版本更新说明 · v{{version}}',
    defaultReleaseNote: '包含最新功能与问题修复。',
  },

  // Updater
  updater: {
    upToDate: '当前已是最新版本',
    checkFailed: '检查更新失败',
    checkFailedDesc: '请稍后重试或检查网络连接。',
    newVersion: '🎉 发现新版本 v{{version}}',
    laterBtn: '稍后更新',
    updateBtn: '立即更新',
    downloading: '正在下载更新…',
    updateComplete: '更新完成',
    restarting: '即将重启应用以完成更新…',
    updateFailed: '更新失败',
  },

  // Notepad default name pool
  notepadNames: [
    '草稿', '笔记', '备忘', '随记', '摘录',
    '五行天', '修真世界', '永生', '斗破苍穹', '武动乾坤',
    '剑来', '雪中悍刀行', '庆余年', '诡秘之主',
  ],

  // Tray menu
  tray: {
    showWindow: '显示窗口',
    checkForUpdates: '检查更新…',
    quit: '退出',
    language: '语言',
  },

  // Settings
  settings: {
    title: '设置',
    language: '语言',
    languageAuto: '自动（跟随系统）',
    checkForUpdates: '检查更新…',
    aboutApp: '关于 Firewood',
  },
};

export default zhCN;
