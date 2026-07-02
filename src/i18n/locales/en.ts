const en = {
  // App-level
  app: {
    name: 'Firewood',
  },

  // Sidebar
  sidebar: {
    showAll: 'Show All',
    hideAll: 'Hide All',
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
  },

  // Tool names
  toolName: {
    'json-formatter': 'JSON',
    timestamp: 'Timestamp',
    notepad: 'Notepad',
    'img-to-pdf': 'Image to PDF',
    translate: 'Translate',
  },

  // Common actions
  action: {
    format: 'Format',
    minify: 'Minify',
    unescape: 'Unescape',
    clear: 'Clear',
    convert: 'Convert',
    copy: 'Copy',
    copied: 'Copied',
    rename: 'Rename',
    cancel: 'Cancel',
    ok: 'OK',
    save: 'Save',
    delete: 'Delete',
    translate: 'Translate',
  },

  // Common labels
  label: {
    result: 'Result',
    file: 'File',
    text: 'Text',
    seconds: 'Seconds',
    milliseconds: 'Milliseconds',
    timestamp: 'Timestamp',
    date: 'Date',
    settings: 'Settings',
    language: 'Language',
  },

  // Font size control
  fontSizeControl: {
    decrease: 'Decrease font size',
    increase: 'Increase font size',
  },

  // JSON
  jsonFormatter: {
    title: 'JSON',
    description: 'Format, minify & unescape JSON',
    emptyHint: 'Paste JSON or escaped text, then format, minify, or unescape it here',
  },

  // Timestamp
  timestamp: {
    title: 'Timestamp',
    description: 'Convert between Unix timestamps and dates',
    tsToDate: 'Timestamp → Date',
    dateToTs: 'Date → Timestamp',
    enterTs: 'Enter Unix timestamp',
    selectDate: 'Select Date',
    currentTime: 'Now',
    currentDate: 'Today',
    history: 'Conversion History',
    noHistory: 'No conversion records',
    tsToDateTag: 'TS → Date',
    dateToTsTag: 'Date → TS',
    copyDetails: 'Copy conversion details',
    formatCopyTsToDate: 'Timestamp → Date',
    formatCopyDateToTs: 'Date → Timestamp',
    formatCopyDate: 'Date',
    formatCopyTs: 'Timestamp',
  },

  // Notepad
  notepad: {
    title: 'Notepad',
    description: 'Multi-tab local notepad with local file open',
    untitled: 'Untitled',
    newTab: 'New Tab',
    deleteTab: 'Delete Tab',
    confirmDelete: 'Are you sure you want to delete "{{name}}"? This cannot be undone.',
    maxTabs: 'Maximum {{count}} tabs allowed',
    tabName: 'Tab Name',
    enterName: 'Enter tab name',
    formatJson: 'Format JSON',
    chars: 'chars',
    selected: 'selected',
    line: 'Ln',
    maxNameLength: 'Name must be at most {{count}} characters',
    namePlaceholder: 'e.g.: notes.md',
    openFile: 'Open Local File',
    saveAs: 'Save As',
    textFiles: 'Text Files',
    fileOpened: 'Opened "{{name}}"',
    fileReloaded: 'Reloaded "{{name}}"',
    fileSaved: 'Saved "{{name}}"',
    openFailed: 'Failed to open file: {{error}}',
    saveFailed: 'Failed to save file: {{error}}',
  },

  // Image to PDF
  imgToPdf: {
    title: 'Image to PDF',
    description: 'Arrange images and export as A4 PDF',
    addImages: 'Add Images',
    clickOrDrag: 'Click or drag, batch supported',
    imageCount: '{{count}} images · drag to reorder',
    perPage: 'Per page',
    images: 'images',
    layout: 'Layout',
    vertical: 'Vertical',
    horizontal: 'Horizontal',
    imageScale: 'Image Scale',
    pageMargin: 'Page Margin',
    uniformScale: 'Uniform Scale',
    phonePreset: 'Phone Photos',
    receiptPreset: 'Receipt / ID',
    resetDefault: 'Reset',
    sizeLimit: 'Size Limit',
    sizePlaceholder: 'e.g. 2.5M',
    sizeHint: 'Leave empty for no limit; auto-compresses to fit size',
    exportPdf: 'Export PDF · {{count}} pages',
    previewHint: 'Add images to preview layout',
    pdfSaved: 'PDF saved',
    generateFailed: 'Generation failed: {{error}}',
    addImagesFirst: 'Please add images first',
    minSize: 'Minimum compressed size is {{size}}MB, cannot reach target',
    actualSize: 'Actual size {{size}}MB',
    pdfFilter: 'PDF File',
    previewTip: 'Preview and export use the same scale and margin settings',
    remove: 'Remove',
    readFailed: '{{count}} image(s) failed to read',
  },

  // Translate
  translate: {
    title: 'Translate',
    description: 'Translate via Tencent Cloud / Baidu API',
    engine: 'Engine',
    tencent: 'Tencent',
    baidu: 'Baidu',
    swapLang: 'Swap languages',
    collapseConfig: 'Collapse Config',
    apiConfig: 'API Config',
    sourceText: 'Source',
    targetText: 'Translation',
    enterText: 'Enter text to translate..',
    translationResult: 'Translation result',
    configureKeys: 'Please configure API keys first',
    history: 'Translation History',
    noHistory: 'No translation records',
    copyDetails: 'Copy translation details',
    tencentGuide: 'Visit {link} to get SecretId and SecretKey (5M free chars/month)',
    tencentLink: 'Tencent Cloud API Key Management',
    baiduGuide: 'Visit {link} to get APPID and Secret (50K free chars/month for standard plan)',
    baiduLink: 'Baidu Translate Developer Portal',
    secretLabel: 'Secret',
  },

  // Languages
  lang: {
    zh: 'Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    ru: 'Russian',
    pt: 'Portuguese',
    it: 'Italian',
    vi: 'Vietnamese',
    th: 'Thai',
    ar: 'Arabic',
    auto: 'Auto Detect',
  },

  // Tencent regions
  region: {
    'ap-guangzhou': 'Guangzhou',
    'ap-shanghai': 'Shanghai',
    'ap-beijing': 'Beijing',
    'ap-chengdu': 'Chengdu',
    'ap-hongkong': 'Hong Kong',
  },

  // About dialog
  about: {
    subtitle: 'A compact toolbox for efficient dev workflows.',
    viewChanges: 'Changelog',
    releaseNotesTitle: 'Release Notes · v{{version}}',
    defaultReleaseNote: 'Includes the latest features and bug fixes.',
  },

  // Updater
  updater: {
    upToDate: 'Already up to date',
    checkFailed: 'Failed to check for updates',
    checkFailedDesc: 'Please try again later or check your network.',
    newVersion: '🎉 New version v{{version}} available',
    laterBtn: 'Later',
    updateBtn: 'Update Now',
    downloading: 'Downloading update…',
    updateComplete: 'Update complete',
    restarting: 'Restarting to apply update…',
    updateFailed: 'Update failed',
  },

  // Notepad default name pool
  notepadNames: [
    'Draft',
    'Notes',
    'Memo',
    'Scratch',
    'Snippet',
    'Ideas',
    'Tasks',
    'Journal',
    'Log',
    'Quick Note',
    'Thoughts',
    'Review',
    'Summary',
    'Reference',
  ],

  // Tray menu
  tray: {
    showWindow: 'Show Window',
    checkForUpdates: 'Check for Updates…',
    quit: 'Quit',
    language: 'Language',
  },

  // Settings
  settings: {
    title: 'Settings',
    language: 'Language',
    languageAuto: 'Auto (System)',
    checkForUpdates: 'Check for Updates…',
    aboutApp: 'About Firewood',
  },
};

export default en;
