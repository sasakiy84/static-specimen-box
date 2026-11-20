const API = "https://datasets-server.huggingface.co";
const HUB = "https://huggingface.co";
const PREFIX = "nvidia/Nemotron-Personas-";
const CATALOG_URL =
  HUB + "/api/datasets?author=nvidia&search=Nemotron-Personas&limit=100";
const DEFAULT_SCOPE = "all";
const FORMATS = ["background", "all", "json"];
const BUILTIN = [
  ["Japan", "日本", "日本語", ["train"]],
  ["USA", "アメリカ", "英語", ["train"]],
  ["India", "インド", "英語", ["en_IN", "hi_Deva_IN", "hi_Latn_IN"]],
  ["Singapore", "シンガポール", "英語", ["train"]],
  ["Korea", "韓国", "韓国語", ["train"]],
  ["Vietnam", "ベトナム", "ベトナム語", ["train"]],
  ["Brazil", "ブラジル", "ポルトガル語", ["train"]],
  ["France", "フランス", "フランス語", ["train"]],
  ["El-Salvador", "エルサルバドル", "スペイン語", ["train"]],
  ["Belgium", "ベルギー", "英語", ["en_BE", "nl_BE", "fr_BE", "de_BE"]],
];
const BASIC_KEYS = [
  "age",
  "sex",
  "occupation",
  "country",
  "prefecture",
  "city",
  "state",
  "province",
  "district",
  "municipality",
  "commune",
  "departement",
  "department",
  "planning_area",
  "region",
  "area",
  "zone",
  "education_level",
  "education_degree",
  "bachelors_field",
  "marital_status",
  "household_type",
  "family_type",
  "housing_type",
  "industry",
  "first_language",
  "second_language",
  "third_language",
  "languages_spoken",
  "military_status",
];
const BACKGROUND_KEYS = [
  "cultural_background",
  "linguistic_background",
  "skills_and_expertise",
  "hobbies_and_interests",
  "career_goals_and_ambitions",
  "family_persona",
  "linguistic_persona",
];
const ids = [
  "uiLanguage",
  "englishPrompt",
  "localPrompt",
  "localPromptDetails",
  "localPromptTitle",
  "copyEnglishPrompt",
  "copyLocalPrompt",
  "drawForm",
  "controlsFieldset",
  "selectors",
  "country",
  "languageField",
  "split",
  "minAge",
  "maxAge",
  "sex",
  "filtersDetails",
  "resetFilters",
  "drawButton",
  "drawLabel",
  "cancelButton",
  "resultPanel",
  "personaName",
  "output",
  "status",
  "copyButton",
  "downloadButton",
  "copyUrlButton",
  "copyDialog",
  "manualCopy",
  "selectManualCopy",
  "closeCopyDialog",
];
const el = Object.fromEntries(
  ids.map((id) => [id, document.getElementById(id)]),
);
const formatButtons = [...document.querySelectorAll("[data-view]")];
const state = {
  catalog: new Map(),
  metadata: new Map(),
  current: null,
  view: "background",
  abort: null,
  job: 0,
  busy: false,
  url: "",
  addressWritable: true,
  ui: "en",
  notice: null,
};
for (const [suffix, label, language, splits] of BUILTIN)
  state.catalog.set(PREFIX + suffix, {
    id: PREFIX + suffix,
    label,
    language,
    license: "cc-by-4.0",
    splits: splits.map((split) => ({ config: "default", split })),
  });

const I18N = {
  ja: {
    uiLanguage: "表示言語",
    synthetic: "合成人物データ",
    controls: "抽出条件",
    dataset: "国・データセット",
    dataLanguage: "データの言語",
    allCountries: "すべての国から",
    defaultLanguages: "各国の既定言語",
    allHint: "国を同じ確率で選びます。インドとベルギーは英語版を使用します。",
    filters: "絞り込み",
    optional: "任意",
    sex: "性別",
    any: "指定なし",
    female: "女性",
    male: "男性",
    age: "年齢",
    minAge: "下限なし",
    maxAge: "上限なし",
    minAgeLabel: "年齢の下限",
    maxAgeLabel: "年齢の上限",
    filterHint:
      "ランダムな候補を最大300件調べます。見つからない場合は再抽出してください。",
    resetFilters: "絞り込みをクリア",
    draw: "ランダムに抽出",
    loading: "取得中…",
    cancel: "取得を中止",
    usage: "使い方の例",
    usageIntro:
      "背景情報をプロンプトに使い、AIエージェントを英会話やその人物の言語を練習する相手にできます。例文には表示中の人物の背景が自動で入ります。",
    englishExample: "英会話練習のプロンプト例",
    localExample: "{language}の練習用プロンプト例",
    promptCopy: "プロンプトをコピー",
    promptWaiting: "人物を取得すると、背景情報を含むプロンプトが表示されます。",
    background: "背景情報",
    persona: "ペルソナ",
    unknownName: "氏名不明",
    backgroundText: "背景テキスト",
    allFields: "全項目",
    outputFormat: "出力形式",
    copy: "コピー",
    save: "保存",
    replayUrl: "再現用URL",
    outputPlaceholder: "Hugging Faceからペルソナを取得します。",
    outputLabel: "コピー用の背景情報",
    chars: "{count}文字",
    datasetUsed: "使用データセット",
    sourceWaiting: "取得後にデータセットを表示します。",
    rows: "{count}行",
    unverified: "確認できません",
    checkLicense: "データセットでライセンスを確認",
    manualCopy: "手動でコピー",
    manualCopyHint:
      "ブラウザが自動コピーを許可しませんでした。選択したテキストをコピーしてください。",
    selectAll: "すべて選択",
    close: "閉じる",
    noScript: "このツールを使うにはJavaScriptを有効にしてください。",
    basicInfo: "基本情報",
    personaLabel: "人物像",
    rawDataNote: "人物の背景情報はデータの原文です。",
    promptTemplate:
      "私は{language}を学んでいます。以下の背景を持つ人物として、{language}で会話の相手をしてください。簡単な自己紹介から始め、質問は一度に一つにして、私の返答を待ってください。不自然な表現があれば、短く言い直してから会話を続けてください。\n\n人物の背景:\n{background}",
    original: "原文",
    personaLanguage: "背景情報に記載された言語",
    uiChanged: "表示言語を変更しました。",
    fetching: "Hugging Faceから取得しています…",
    previousResult: "表示中の内容は前回の結果です。",
    cancelled: "取得を中止しました。",
    fetchFailed: "取得に失敗しました。",
    searching: "条件に合う候補を探しています… {round} / 3",
    drew: "ランダムに1件を抽出しました。",
    drewFiltered: "ランダムな候補{count}件から抽出しました。",
    partial: "APIが返せる一部のデータを対象にしています。",
    revisionMissing: "この応答ではデータの版を確認できません。",
    addressUnavailable:
      "アドレス欄を更新できないため「再現用URL」をコピーしてください。",
    restoring: "URLに記録された人物を再表示しています…",
    restoredVerified: "URLに記録された位置・版・UUIDの一致を確認しました。",
    restored: "指定した位置を表示しました。",
    replayEnriched: "版とUUIDを再現用URLに追加しました。",
    replayUnverified: "この応答では版またはUUIDを確認できません。",
    copied: "表示中のテキストをコピーしました。",
    promptCopied: "プロンプトをコピーしました。",
    urlCopied: "再現用URLをコピーしました。",
    saving: "現在の出力をファイルに保存します。",
    conditionsChanged: "抽出条件を変更しました。再抽出すると反映されます。",
    dataLanguageChanged:
      "データの言語を変更しました。再抽出すると反映されます。",
    filtersReset: "次の抽出に使う絞り込みをクリアしました。",
    fields: {
      cultural_background: "文化・生い立ち",
      skills_and_expertise: "スキル・専門知識",
      hobbies_and_interests: "趣味・関心",
      career_goals_and_ambitions: "目標・将来像",
      linguistic_background: "言語的背景",
      linguistic_persona: "言語に関する人物像",
      family_persona: "家族に関する人物像",
      age: "年齢",
      sex: "性別",
      occupation: "職業",
      country: "国",
      education_level: "学歴",
      education_degree: "学位",
      bachelors_field: "専攻",
      marital_status: "婚姻状況",
      prefecture: "都道府県",
      city: "都市",
      state: "州",
      region: "地域",
      area: "エリア",
      district: "地区",
      province: "道・州",
      zone: "居住区分",
      municipality: "自治体",
      commune: "コミューン",
      departement: "県",
      department: "県",
      planning_area: "計画区域",
      zipcode: "郵便番号",
      industry: "業種",
      first_language: "第一言語",
      second_language: "第二言語",
      third_language: "第三言語",
      languages_spoken: "使用言語",
      household_type: "世帯構成",
      family_type: "家族構成",
      housing_type: "住居",
      military_status: "兵役状況",
    },
    siteTitle: "一期一会",
  },
  en: {
    uiLanguage: "Interface language",
    synthetic: "Synthetic persona data",
    controls: "Selection",
    dataset: "Country / dataset",
    dataLanguage: "Data language",
    allCountries: "All countries",
    defaultLanguages: "Default language for each country",
    allHint:
      "Each country has an equal chance of being selected. India and Belgium use the English versions.",
    filters: "Filters",
    optional: "Optional",
    sex: "Sex",
    any: "Any",
    female: "Female",
    male: "Male",
    age: "Age",
    minAge: "No minimum",
    maxAge: "No maximum",
    minAgeLabel: "Minimum age",
    maxAgeLabel: "Maximum age",
    filterHint:
      "Checks up to 300 random candidates. Try again if no match is found.",
    resetFilters: "Clear filters",
    draw: "Pick a random persona",
    loading: "Loading…",
    cancel: "Cancel",
    usage: "Usage examples",
    usageIntro:
      "Use the background in a prompt to make an AI agent a conversation partner for English or the persona’s language. The examples automatically include the background of the displayed persona.",
    englishExample: "English conversation prompt",
    localExample: "{language} practice prompt",
    promptCopy: "Copy prompt",
    promptWaiting: "Select a persona to see a prompt with their background.",
    background: "Background",
    persona: "Persona",
    unknownName: "Name unavailable",
    backgroundText: "Background text",
    allFields: "All fields",
    outputFormat: "Output format",
    copy: "Copy",
    save: "Save",
    replayUrl: "Link to this persona",
    outputPlaceholder: "Load a persona from Hugging Face.",
    outputLabel: "Background to copy",
    chars: "{count} characters",
    datasetUsed: "Dataset used",
    sourceWaiting: "The dataset will appear after loading.",
    rows: "{count} rows",
    unverified: "Unavailable",
    checkLicense: "Check the dataset license",
    manualCopy: "Copy manually",
    manualCopyHint:
      "The browser did not allow automatic copying. Copy the selected text manually.",
    selectAll: "Select all",
    close: "Close",
    noScript: "Enable JavaScript to use this tool.",
    basicInfo: "Basic information",
    personaLabel: "Profile",
    rawDataNote:
      "The persona’s background is shown in the original language of the data.",
    promptTemplate:
      "I am learning {language}. Act as the person with the background below and practice conversation with me in {language}. Start with a brief self-introduction, ask one question at a time, and wait for my reply. If I use an unnatural expression, briefly rephrase it before continuing the conversation.\n\nPersona background:\n{background}",
    original: "Original language",
    personaLanguage: "Language stated in the background",
    uiChanged: "Interface language changed.",
    fetching: "Fetching from Hugging Face…",
    previousResult: "The previous result is still displayed.",
    cancelled: "Loading cancelled.",
    fetchFailed: "Loading failed.",
    searching: "Looking for a matching persona… {round} / 3",
    drew: "Selected one random persona.",
    drewFiltered: "Selected from {count} random candidates.",
    partial: "Selection is limited to the data available through the API.",
    revisionMissing: "This response does not identify the data revision.",
    addressUnavailable:
      "The address bar could not be updated. Copy “Link to this persona” instead.",
    restoring: "Loading the persona recorded in the URL…",
    restoredVerified:
      "Confirmed the row position, revision, and UUID recorded in the URL.",
    restored: "Loaded the specified row.",
    replayEnriched: "Added the revision and UUID to this persona’s link.",
    replayUnverified:
      "This response does not allow the revision or UUID to be verified.",
    copied: "Copied the displayed text.",
    promptCopied: "Copied the prompt.",
    urlCopied: "Copied the link to this persona.",
    saving: "Saving the current output to a file.",
    conditionsChanged:
      "Selection conditions changed. They apply to the next draw.",
    dataLanguageChanged: "Data language changed. It applies to the next draw.",
    filtersReset: "Cleared the filters for the next draw.",
    fields: {
      cultural_background: "Culture and upbringing",
      skills_and_expertise: "Skills and expertise",
      hobbies_and_interests: "Hobbies and interests",
      career_goals_and_ambitions: "Goals and ambitions",
      linguistic_background: "Language background",
      linguistic_persona: "Language profile",
      family_persona: "Family profile",
      age: "Age",
      sex: "Sex",
      occupation: "Occupation",
      country: "Country",
      education_level: "Education level",
      education_degree: "Degree",
      bachelors_field: "Field of study",
      marital_status: "Marital status",
      prefecture: "Prefecture",
      city: "City",
      state: "State",
      region: "Region",
      area: "Area",
      district: "District",
      province: "Province",
      zone: "Residential zone",
      municipality: "Municipality",
      commune: "Commune",
      departement: "Department",
      department: "Department",
      planning_area: "Planning area",
      zipcode: "Postal code",
      industry: "Industry",
      first_language: "First language",
      second_language: "Second language",
      third_language: "Third language",
      languages_spoken: "Languages spoken",
      household_type: "Household type",
      family_type: "Family type",
      housing_type: "Housing",
      military_status: "Military service status",
    },
    siteTitle: "Chance Encounters",
  },
  zh: {
    uiLanguage: "界面语言",
    synthetic: "合成人物数据",
    controls: "抽取条件",
    dataset: "国家与数据集",
    dataLanguage: "数据语言",
    allCountries: "所有国家",
    defaultLanguages: "各国默认语言",
    allHint: "各国被选中的概率相同。印度和比利时使用英语版本。",
    filters: "筛选",
    optional: "可选",
    sex: "性别",
    any: "不限",
    female: "女性",
    male: "男性",
    age: "年龄",
    minAge: "无下限",
    maxAge: "无上限",
    minAgeLabel: "最低年龄",
    maxAgeLabel: "最高年龄",
    filterHint: "最多检查300个随机候选人物。如未找到匹配结果，请重新抽取。",
    resetFilters: "清除筛选",
    draw: "随机抽取",
    loading: "正在加载…",
    cancel: "取消加载",
    usage: "使用示例",
    usageIntro:
      "将背景信息加入提示词，让AI智能体扮演英语或该人物所用语言的会话练习伙伴。示例会自动包含当前人物的背景信息。",
    englishExample: "英语会话练习提示词示例",
    localExample: "{language}练习提示词示例",
    promptCopy: "复制提示词",
    promptWaiting: "获取人物后，这里会显示包含其背景信息的提示词。",
    background: "背景信息",
    persona: "人物",
    unknownName: "姓名不详",
    backgroundText: "背景文本",
    allFields: "全部字段",
    outputFormat: "输出格式",
    copy: "复制",
    save: "保存",
    replayUrl: "当前人物链接",
    outputPlaceholder: "从Hugging Face获取人物。",
    outputLabel: "可复制的背景信息",
    chars: "{count}个字符",
    datasetUsed: "所用数据集",
    sourceWaiting: "加载后将显示数据集信息。",
    rows: "{count}行",
    unverified: "无法确认",
    checkLicense: "查看数据集许可协议",
    manualCopy: "手动复制",
    manualCopyHint: "浏览器未允许自动复制。请手动复制选中的文本。",
    selectAll: "全选",
    close: "关闭",
    noScript: "请启用JavaScript以使用此工具。",
    basicInfo: "基本信息",
    personaLabel: "人物介绍",
    rawDataNote: "人物背景信息保留数据中的原文。",
    promptTemplate:
      "我正在学习{language}。请扮演具有以下背景的人物，用{language}与我练习会话。先做简短的自我介绍，每次只问一个问题，并等待我的回答。如果我的表达不自然，请简短地给出更自然的说法，然后继续对话。\n\n人物背景：\n{background}",
    original: "原文",
    personaLanguage: "背景信息中注明的语言",
    uiChanged: "已更改界面语言。",
    fetching: "正在从Hugging Face获取数据…",
    previousResult: "当前仍显示上一次的结果。",
    cancelled: "已取消加载。",
    fetchFailed: "加载失败。",
    searching: "正在查找符合条件的人物… {round} / 3",
    drew: "已随机抽取一个人物。",
    drewFiltered: "已从{count}个随机候选人物中选出结果。",
    partial: "抽取范围仅限于API可返回的部分数据。",
    revisionMissing: "本次响应未提供可确认的数据版本。",
    addressUnavailable: "无法更新地址栏，请复制“当前人物链接”。",
    restoring: "正在重新加载URL中记录的人物…",
    restoredVerified: "已确认行位置、版本和UUID与URL中的记录一致。",
    restored: "已加载指定位置的数据。",
    replayEnriched: "已将版本和UUID加入当前人物链接。",
    replayUnverified: "无法从本次响应中确认版本或UUID。",
    copied: "已复制当前文本。",
    promptCopied: "已复制提示词。",
    urlCopied: "已复制当前人物链接。",
    saving: "正在将当前输出保存为文件。",
    conditionsChanged: "已更改抽取条件，下次抽取时生效。",
    dataLanguageChanged: "已更改数据语言，下次抽取时生效。",
    filtersReset: "已清除下次抽取所用的筛选条件。",
    fields: {
      cultural_background: "文化与成长背景",
      skills_and_expertise: "技能与专业知识",
      hobbies_and_interests: "兴趣爱好",
      career_goals_and_ambitions: "目标与抱负",
      linguistic_background: "语言背景",
      linguistic_persona: "语言相关介绍",
      family_persona: "家庭相关介绍",
      age: "年龄",
      sex: "性别",
      occupation: "职业",
      country: "国家",
      education_level: "学历",
      education_degree: "学位",
      bachelors_field: "专业",
      marital_status: "婚姻状况",
      prefecture: "都道府县",
      city: "城市",
      state: "州",
      region: "地区",
      area: "区域",
      district: "行政区",
      province: "省／州",
      zone: "居住区域",
      municipality: "市镇",
      commune: "市镇",
      departement: "省",
      department: "省",
      planning_area: "规划区",
      zipcode: "邮政编码",
      industry: "行业",
      first_language: "第一语言",
      second_language: "第二语言",
      third_language: "第三语言",
      languages_spoken: "使用语言",
      household_type: "住户构成",
      family_type: "家庭构成",
      housing_type: "住房类型",
      military_status: "兵役状况",
    },
    siteTitle: "不期而遇",
  },
  ko: {
    uiLanguage: "표시 언어",
    synthetic: "합성 인물 데이터",
    controls: "선택 조건",
    dataset: "국가 / 데이터셋",
    dataLanguage: "데이터 언어",
    allCountries: "모든 국가",
    defaultLanguages: "국가별 기본 언어",
    allHint:
      "각 국가는 같은 확률로 선택됩니다. 인도와 벨기에는 영어 버전을 사용합니다.",
    filters: "필터",
    optional: "선택 사항",
    sex: "성별",
    any: "제한 없음",
    female: "여성",
    male: "남성",
    age: "나이",
    minAge: "하한 없음",
    maxAge: "상한 없음",
    minAgeLabel: "최소 나이",
    maxAgeLabel: "최대 나이",
    filterHint:
      "무작위 후보를 최대 300명 확인합니다. 일치하는 인물이 없으면 다시 시도하세요.",
    resetFilters: "필터 초기화",
    draw: "무작위 인물 선택",
    loading: "불러오는 중…",
    cancel: "취소",
    usage: "활용 예시",
    usageIntro:
      "배경 정보를 프롬프트에 넣어 AI 에이전트를 영어 또는 해당 인물의 언어로 대화하는 연습 상대로 활용할 수 있습니다. 예시에는 화면에 표시된 인물의 배경 정보가 자동으로 포함됩니다.",
    englishExample: "영어 회화 연습용 프롬프트",
    localExample: "{language} 연습용 프롬프트",
    promptCopy: "프롬프트 복사",
    promptWaiting:
      "인물을 선택하면 해당 배경 정보가 포함된 프롬프트가 표시됩니다.",
    background: "배경 정보",
    persona: "인물",
    unknownName: "이름을 확인할 수 없음",
    backgroundText: "배경 텍스트",
    allFields: "모든 항목",
    outputFormat: "출력 형식",
    copy: "복사",
    save: "저장",
    replayUrl: "이 인물의 링크",
    outputPlaceholder: "Hugging Face에서 인물을 불러옵니다.",
    outputLabel: "복사할 배경 정보",
    chars: "{count}자",
    datasetUsed: "사용한 데이터셋",
    sourceWaiting: "불러오기가 완료되면 데이터셋이 표시됩니다.",
    rows: "{count}행",
    unverified: "확인 불가",
    checkLicense: "데이터셋 라이선스 확인",
    manualCopy: "직접 복사",
    manualCopyHint:
      "브라우저가 자동 복사를 허용하지 않았습니다. 선택된 텍스트를 직접 복사하세요.",
    selectAll: "전체 선택",
    close: "닫기",
    noScript: "이 도구를 사용하려면 JavaScript를 활성화하세요.",
    basicInfo: "기본 정보",
    personaLabel: "인물 소개",
    rawDataNote: "인물의 배경 정보는 데이터의 원문 언어로 표시됩니다.",
    promptTemplate:
      "저는 {language} 학습자입니다. 아래 배경의 인물 역할을 맡아 {language} 대화를 함께 연습해 주세요. 짧은 자기소개로 시작하고, 한 번에 질문 하나만 한 뒤 제 답변을 기다려 주세요. 제가 부자연스러운 표현을 사용하면 짧게 고쳐 말해 준 다음 대화를 이어 가 주세요.\n\n인물의 배경 정보:\n{background}",
    original: "원문 언어",
    personaLanguage: "배경 정보에 명시된 언어",
    uiChanged: "표시 언어를 변경했습니다.",
    fetching: "Hugging Face에서 불러오는 중…",
    previousResult: "이전 결과가 계속 표시됩니다.",
    cancelled: "불러오기를 취소했습니다.",
    fetchFailed: "불러오지 못했습니다.",
    searching: "조건에 맞는 인물을 찾는 중… {round} / 3",
    drew: "인물 한 명을 무작위로 선택했습니다.",
    drewFiltered: "무작위 후보 {count}명 중에서 선택했습니다.",
    partial: "API를 통해 이용할 수 있는 데이터만 선택 대상에 포함됩니다.",
    revisionMissing: "이 응답에서는 데이터 버전을 확인할 수 없습니다.",
    addressUnavailable:
      "주소 표시줄을 갱신하지 못했습니다. “이 인물의 링크”를 복사하세요.",
    restoring: "URL에 기록된 인물을 불러오는 중…",
    restoredVerified:
      "URL에 기록된 행 위치, 버전, UUID가 일치함을 확인했습니다.",
    restored: "지정한 행을 불러왔습니다.",
    replayEnriched: "이 인물의 링크에 버전과 UUID를 추가했습니다.",
    replayUnverified: "이 응답으로는 버전이나 UUID를 확인할 수 없습니다.",
    copied: "표시된 텍스트를 복사했습니다.",
    promptCopied: "프롬프트를 복사했습니다.",
    urlCopied: "이 인물의 링크를 복사했습니다.",
    saving: "현재 출력을 파일로 저장합니다.",
    conditionsChanged: "선택 조건을 변경했습니다. 다음 선택부터 적용됩니다.",
    dataLanguageChanged:
      "데이터 언어를 변경했습니다. 다음 선택부터 적용됩니다.",
    filtersReset: "다음 선택에 사용할 필터를 초기화했습니다.",
    fields: {
      cultural_background: "문화와 성장 배경",
      skills_and_expertise: "기술과 전문 지식",
      hobbies_and_interests: "취미와 관심사",
      career_goals_and_ambitions: "목표와 포부",
      linguistic_background: "언어적 배경",
      linguistic_persona: "언어 관련 인물 소개",
      family_persona: "가족 관련 인물 소개",
      age: "나이",
      sex: "성별",
      occupation: "직업",
      country: "국가",
      education_level: "학력",
      education_degree: "학위",
      bachelors_field: "전공",
      marital_status: "혼인 상태",
      prefecture: "도도부현",
      city: "도시",
      state: "주",
      region: "지역",
      area: "구역",
      district: "구·군",
      province: "도·주",
      zone: "거주 구분",
      municipality: "지방자치단체",
      commune: "코뮌",
      departement: "행정구",
      department: "행정구",
      planning_area: "계획 구역",
      zipcode: "우편번호",
      industry: "업종",
      first_language: "제1언어",
      second_language: "제2언어",
      third_language: "제3언어",
      languages_spoken: "사용 언어",
      household_type: "가구 유형",
      family_type: "가족 유형",
      housing_type: "주거 형태",
      military_status: "병역 상태",
    },
    siteTitle: "우연한 만남",
  },
  hi: {
    uiLanguage: "इंटरफ़ेस की भाषा",
    synthetic: "कृत्रिम व्यक्तियों का डेटा",
    controls: "चयन",
    dataset: "देश / डेटासेट",
    dataLanguage: "डेटा की भाषा",
    allCountries: "सभी देश",
    defaultLanguages: "हर देश की डिफ़ॉल्ट भाषा",
    allHint:
      "हर देश के चुने जाने की संभावना समान है। भारत और बेल्जियम के लिए अंग्रेज़ी संस्करण इस्तेमाल होते हैं।",
    filters: "फ़िल्टर",
    optional: "वैकल्पिक",
    sex: "लिंग",
    any: "कोई भी",
    female: "महिला",
    male: "पुरुष",
    age: "उम्र",
    minAge: "न्यूनतम सीमा नहीं",
    maxAge: "अधिकतम सीमा नहीं",
    minAgeLabel: "न्यूनतम उम्र",
    maxAgeLabel: "अधिकतम उम्र",
    filterHint:
      "अधिकतम 300 यादृच्छिक व्यक्तियों की जाँच होती है। कोई मेल न मिले तो फिर कोशिश करें।",
    resetFilters: "फ़िल्टर हटाएँ",
    draw: "यादृच्छिक व्यक्ति चुनें",
    loading: "लोड हो रहा है…",
    cancel: "रद्द करें",
    usage: "इस्तेमाल के उदाहरण",
    usageIntro:
      "किसी AI एजेंट को अंग्रेज़ी या चुने गए व्यक्ति की भाषा में बातचीत का साथी बनाने के लिए प्रॉम्प्ट में उसकी पृष्ठभूमि जोड़ें। इन उदाहरणों में दिखाए गए व्यक्ति की पृष्ठभूमि अपने आप जुड़ती है।",
    englishExample: "अंग्रेज़ी बातचीत का प्रॉम्प्ट",
    localExample: "{language} अभ्यास का प्रॉम्प्ट",
    promptCopy: "प्रॉम्प्ट कॉपी करें",
    promptWaiting:
      "किसी व्यक्ति को चुनें, ताकि उसकी पृष्ठभूमि वाला प्रॉम्प्ट दिखे।",
    background: "पृष्ठभूमि",
    persona: "व्यक्ति",
    unknownName: "नाम उपलब्ध नहीं",
    backgroundText: "पृष्ठभूमि का पाठ",
    allFields: "सभी फ़ील्ड",
    outputFormat: "आउटपुट का प्रारूप",
    copy: "कॉपी करें",
    save: "सहेजें",
    replayUrl: "इस व्यक्ति का लिंक",
    outputPlaceholder: "Hugging Face से कोई व्यक्ति लोड करें।",
    outputLabel: "कॉपी करने के लिए पृष्ठभूमि",
    chars: "{count} अक्षर",
    datasetUsed: "इस्तेमाल किया गया डेटासेट",
    sourceWaiting: "लोड होने के बाद डेटासेट दिखेगा।",
    rows: "{count} पंक्तियाँ",
    unverified: "उपलब्ध नहीं",
    checkLicense: "डेटासेट का लाइसेंस देखें",
    manualCopy: "खुद कॉपी करें",
    manualCopyHint:
      "ब्राउज़र ने अपने आप कॉपी करने की अनुमति नहीं दी। चुना हुआ पाठ खुद कॉपी करें।",
    selectAll: "सभी चुनें",
    close: "बंद करें",
    noScript: "इस टूल को इस्तेमाल करने के लिए JavaScript चालू करें।",
    basicInfo: "बुनियादी जानकारी",
    personaLabel: "परिचय",
    rawDataNote: "व्यक्ति की पृष्ठभूमि डेटा की मूल भाषा में दिखाई जाती है।",
    promptTemplate:
      "मैं {language} सीख रहा/रही हूँ। नीचे दी गई पृष्ठभूमि वाले व्यक्ति की भूमिका निभाएँ और मेरे साथ {language} में बातचीत का अभ्यास करें। पहले अपना संक्षिप्त परिचय दें, एक बार में एक सवाल पूछें और मेरे जवाब की प्रतीक्षा करें। यदि मैं कोई अस्वाभाविक अभिव्यक्ति इस्तेमाल करूँ, तो बातचीत जारी रखने से पहले संक्षेप में उसे स्वाभाविक ढंग से कहकर बताएँ।\n\nव्यक्ति की पृष्ठभूमि:\n{background}",
    original: "मूल भाषा",
    personaLanguage: "पृष्ठभूमि में बताई गई भाषा",
    uiChanged: "इंटरफ़ेस की भाषा बदल दी गई।",
    fetching: "Hugging Face से लाया जा रहा है…",
    previousResult: "पिछला परिणाम अभी भी दिख रहा है।",
    cancelled: "लोड करना रद्द कर दिया गया।",
    fetchFailed: "लोड नहीं हो सका।",
    searching: "शर्तों से मेल खाने वाला व्यक्ति खोजा जा रहा है… {round} / 3",
    drew: "एक यादृच्छिक व्यक्ति चुन लिया गया।",
    drewFiltered: "{count} यादृच्छिक व्यक्तियों में से चुना गया।",
    partial: "चयन API से उपलब्ध डेटा तक सीमित है।",
    revisionMissing: "इस जवाब में डेटा के संशोधन की पहचान नहीं दी गई है।",
    addressUnavailable:
      "पता बार अपडेट नहीं हो सका। इसके बजाय “इस व्यक्ति का लिंक” कॉपी करें।",
    restoring: "URL में दर्ज व्यक्ति लोड किया जा रहा है…",
    restoredVerified:
      "URL में दर्ज पंक्ति की स्थिति, संशोधन और UUID की पुष्टि हो गई।",
    restored: "बताई गई पंक्ति लोड कर दी गई।",
    replayEnriched: "इस व्यक्ति के लिंक में संशोधन और UUID जोड़ दिए गए।",
    replayUnverified: "इस जवाब से संशोधन या UUID की पुष्टि नहीं हो सकती।",
    copied: "दिखाया गया पाठ कॉपी कर लिया गया।",
    promptCopied: "प्रॉम्प्ट कॉपी कर लिया गया।",
    urlCopied: "इस व्यक्ति का लिंक कॉपी कर लिया गया।",
    saving: "मौजूदा आउटपुट फ़ाइल में सहेजा जा रहा है।",
    conditionsChanged:
      "चयन की शर्तें बदल दी गईं। वे अगले यादृच्छिक चयन पर लागू होंगी।",
    dataLanguageChanged:
      "डेटा की भाषा बदल दी गई। यह अगले यादृच्छिक चयन पर लागू होगी।",
    filtersReset: "अगले यादृच्छिक चयन के लिए फ़िल्टर हटा दिए गए।",
    fields: {
      cultural_background: "संस्कृति और परवरिश",
      skills_and_expertise: "कौशल और विशेषज्ञता",
      hobbies_and_interests: "शौक और रुचियाँ",
      career_goals_and_ambitions: "लक्ष्य और महत्वाकांक्षाएँ",
      linguistic_background: "भाषाई पृष्ठभूमि",
      linguistic_persona: "भाषाई परिचय",
      family_persona: "परिवार का परिचय",
      age: "उम्र",
      sex: "लिंग",
      occupation: "पेशा",
      country: "देश",
      education_level: "शिक्षा का स्तर",
      education_degree: "उपाधि",
      bachelors_field: "अध्ययन का विषय",
      marital_status: "वैवाहिक स्थिति",
      prefecture: "प्रीफ़ेक्चर",
      city: "शहर",
      state: "राज्य",
      region: "क्षेत्र",
      area: "इलाका",
      district: "ज़िला",
      province: "प्रांत",
      zone: "आवासीय क्षेत्र",
      municipality: "नगरपालिका",
      commune: "कम्यून",
      departement: "प्रशासनिक विभाग",
      department: "प्रशासनिक विभाग",
      planning_area: "नियोजन क्षेत्र",
      zipcode: "डाक कोड",
      industry: "उद्योग",
      first_language: "पहली भाषा",
      second_language: "दूसरी भाषा",
      third_language: "तीसरी भाषा",
      languages_spoken: "बोली जाने वाली भाषाएँ",
      household_type: "गृहस्थी का प्रकार",
      family_type: "परिवार का प्रकार",
      housing_type: "आवास",
      military_status: "सैन्य सेवा की स्थिति",
    },
    siteTitle: "अनायास मुलाक़ात",
  },
  bn: {
    uiLanguage: "ইন্টারফেসের ভাষা",
    synthetic: "কৃত্রিম ব্যক্তিদের তথ্য",
    controls: "নির্বাচন",
    dataset: "দেশ / ডেটাসেট",
    dataLanguage: "তথ্যের ভাষা",
    allCountries: "সব দেশ",
    defaultLanguages: "প্রতি দেশের ডিফল্ট ভাষা",
    allHint:
      "প্রতিটি দেশ বেছে নেওয়ার সম্ভাবনা সমান। ভারত ও বেলজিয়ামের জন্য ইংরেজি সংস্করণ ব্যবহৃত হয়।",
    filters: "ফিল্টার",
    optional: "ঐচ্ছিক",
    sex: "লিঙ্গ",
    any: "যেকোনো",
    female: "নারী",
    male: "পুরুষ",
    age: "বয়স",
    minAge: "ন্যূনতম সীমা নেই",
    maxAge: "সর্বোচ্চ সীমা নেই",
    minAgeLabel: "ন্যূনতম বয়স",
    maxAgeLabel: "সর্বোচ্চ বয়স",
    filterHint:
      "এলোমেলোভাবে বেছে নেওয়া সর্বোচ্চ ৩০০ জনকে যাচাই করা হয়। কাউকে না পেলে আবার চেষ্টা করুন।",
    resetFilters: "ফিল্টার মুছুন",
    draw: "এলোমেলোভাবে একজন বেছে নিন",
    loading: "লোড হচ্ছে…",
    cancel: "বাতিল করুন",
    usage: "ব্যবহারের উদাহরণ",
    usageIntro:
      "ইংরেজিতে বা নির্বাচিত ব্যক্তির ভাষায় কথোপকথনের সঙ্গী হিসেবে কোনো AI এজেন্টকে ব্যবহার করতে প্রম্পটে তার পটভূমি যোগ করুন। উদাহরণগুলোতে প্রদর্শিত ব্যক্তির পটভূমি স্বয়ংক্রিয়ভাবে যুক্ত হয়।",
    englishExample: "ইংরেজি কথোপকথনের প্রম্পট",
    localExample: "{language} অনুশীলনের প্রম্পট",
    promptCopy: "প্রম্পট কপি করুন",
    promptWaiting: "কারও পটভূমিসহ প্রম্পট দেখতে একজনকে বেছে নিন।",
    background: "পটভূমি",
    persona: "ব্যক্তি",
    unknownName: "নাম পাওয়া যায়নি",
    backgroundText: "পটভূমির লেখা",
    allFields: "সব ঘর",
    outputFormat: "আউটপুটের বিন্যাস",
    copy: "কপি করুন",
    save: "সংরক্ষণ করুন",
    replayUrl: "এই ব্যক্তির লিংক",
    outputPlaceholder: "Hugging Face থেকে একজনকে লোড করুন।",
    outputLabel: "কপি করার জন্য পটভূমি",
    chars: "{count}টি অক্ষর",
    datasetUsed: "ব্যবহৃত ডেটাসেট",
    sourceWaiting: "লোড হওয়ার পর ডেটাসেট দেখা যাবে।",
    rows: "{count}টি সারি",
    unverified: "পাওয়া যায়নি",
    checkLicense: "ডেটাসেটের লাইসেন্স দেখুন",
    manualCopy: "নিজে কপি করুন",
    manualCopyHint:
      "ব্রাউজার স্বয়ংক্রিয়ভাবে কপি করার অনুমতি দেয়নি। নির্বাচিত লেখাটি নিজে কপি করুন।",
    selectAll: "সব নির্বাচন করুন",
    close: "বন্ধ করুন",
    noScript: "এই টুল ব্যবহার করতে JavaScript চালু করুন।",
    basicInfo: "মৌলিক তথ্য",
    personaLabel: "পরিচিতি",
    rawDataNote: "ব্যক্তির পটভূমি তথ্যের মূল ভাষায় দেখানো হয়।",
    promptTemplate:
      "আমি {language} শিখছি। নিচের পটভূমির ব্যক্তির ভূমিকায় অভিনয় করুন এবং আমার সঙ্গে {language} ভাষায় কথোপকথন অনুশীলন করুন। প্রথমে সংক্ষেপে নিজের পরিচয় দিন, একবারে একটি প্রশ্ন করুন এবং আমার উত্তরের জন্য অপেক্ষা করুন। আমি অস্বাভাবিক কোনো অভিব্যক্তি ব্যবহার করলে কথোপকথন চালিয়ে যাওয়ার আগে সংক্ষেপে সেটি স্বাভাবিকভাবে বলে দিন।\n\nব্যক্তির পটভূমি:\n{background}",
    original: "মূল ভাষা",
    personaLanguage: "পটভূমিতে উল্লেখ করা ভাষা",
    uiChanged: "ইন্টারফেসের ভাষা বদলানো হয়েছে।",
    fetching: "Hugging Face থেকে আনা হচ্ছে…",
    previousResult: "আগের ফলাফল এখনও দেখানো হচ্ছে।",
    cancelled: "লোড করা বাতিল হয়েছে।",
    fetchFailed: "লোড করা যায়নি।",
    searching: "শর্তের সঙ্গে মেলে এমন কাউকে খোঁজা হচ্ছে… {round} / 3",
    drew: "এলোমেলোভাবে একজনকে বেছে নেওয়া হয়েছে।",
    drewFiltered:
      "এলোমেলোভাবে বাছা {count} জনের মধ্য থেকে নির্বাচন করা হয়েছে।",
    partial: "নির্বাচন API-এর মাধ্যমে পাওয়া তথ্যের মধ্যে সীমিত।",
    revisionMissing: "এই উত্তরে তথ্যের সংস্করণের পরিচয় দেওয়া নেই।",
    addressUnavailable:
      "ঠিকানা বার হালনাগাদ করা যায়নি। এর বদলে “এই ব্যক্তির লিংক” কপি করুন।",
    restoring: "URL-এ উল্লেখ করা ব্যক্তিকে লোড করা হচ্ছে…",
    restoredVerified:
      "URL-এ থাকা সারির অবস্থান, সংস্করণ ও UUID নিশ্চিত করা হয়েছে।",
    restored: "নির্দিষ্ট সারি লোড করা হয়েছে।",
    replayEnriched: "এই ব্যক্তির লিংকে সংস্করণ ও UUID যোগ করা হয়েছে।",
    replayUnverified: "এই উত্তর থেকে সংস্করণ বা UUID যাচাই করা যায় না।",
    copied: "প্রদর্শিত লেখা কপি করা হয়েছে।",
    promptCopied: "প্রম্পট কপি করা হয়েছে।",
    urlCopied: "এই ব্যক্তির লিংক কপি করা হয়েছে।",
    saving: "বর্তমান আউটপুট একটি ফাইলে সংরক্ষণ করা হচ্ছে।",
    conditionsChanged:
      "নির্বাচনের শর্ত বদলানো হয়েছে। পরের এলোমেলো নির্বাচনে তা প্রযোজ্য হবে।",
    dataLanguageChanged:
      "তথ্যের ভাষা বদলানো হয়েছে। পরের এলোমেলো নির্বাচনে তা প্রযোজ্য হবে।",
    filtersReset: "পরের এলোমেলো নির্বাচনের ফিল্টার মুছে দেওয়া হয়েছে।",
    fields: {
      cultural_background: "সংস্কৃতি ও বেড়ে ওঠা",
      skills_and_expertise: "দক্ষতা ও বিশেষজ্ঞতা",
      hobbies_and_interests: "শখ ও আগ্রহ",
      career_goals_and_ambitions: "লক্ষ্য ও উচ্চাকাঙ্ক্ষা",
      linguistic_background: "ভাষাগত পটভূমি",
      linguistic_persona: "ভাষাগত পরিচিতি",
      family_persona: "পারিবারিক পরিচিতি",
      age: "বয়স",
      sex: "লিঙ্গ",
      occupation: "পেশা",
      country: "দেশ",
      education_level: "শিক্ষার স্তর",
      education_degree: "ডিগ্রি",
      bachelors_field: "পড়াশোনার বিষয়",
      marital_status: "বৈবাহিক অবস্থা",
      prefecture: "প্রিফেকচার",
      city: "শহর",
      state: "রাজ্য",
      region: "অঞ্চল",
      area: "এলাকা",
      district: "জেলা",
      province: "প্রদেশ",
      zone: "আবাসিক অঞ্চল",
      municipality: "পৌরসভা",
      commune: "কমিউন",
      departement: "প্রশাসনিক বিভাগ",
      department: "প্রশাসনিক বিভাগ",
      planning_area: "পরিকল্পনা এলাকা",
      zipcode: "ডাক কোড",
      industry: "শিল্পখাত",
      first_language: "প্রথম ভাষা",
      second_language: "দ্বিতীয় ভাষা",
      third_language: "তৃতীয় ভাষা",
      languages_spoken: "কথ্য ভাষাসমূহ",
      household_type: "গৃহস্থালির ধরন",
      family_type: "পরিবারের ধরন",
      housing_type: "আবাসন",
      military_status: "সামরিক সেবার অবস্থা",
    },
    siteTitle: "হঠাৎ দেখা",
  },
  ta: {
    uiLanguage: "இடைமுக மொழி",
    synthetic: "செயற்கையாக உருவாக்கப்பட்ட நபர் தரவு",
    controls: "தேர்வு",
    dataset: "நாடு / தரவுத்தொகுப்பு",
    dataLanguage: "தரவின் மொழி",
    allCountries: "அனைத்து நாடுகளும்",
    defaultLanguages: "ஒவ்வொரு நாட்டின் இயல்புநிலை மொழி",
    allHint:
      "ஒவ்வொரு நாடும் தேர்ந்தெடுக்கப்படுவதற்கான வாய்ப்பு சமம். இந்தியாவுக்கும் பெல்ஜியத்திற்கும் ஆங்கிலப் பதிப்புகள் பயன்படுத்தப்படும்.",
    filters: "வடிகட்டிகள்",
    optional: "விருப்பத்திற்கேற்ப",
    sex: "பாலினம்",
    any: "அனைத்தும்",
    female: "பெண்",
    male: "ஆண்",
    age: "வயது",
    minAge: "குறைந்தபட்ச வரம்பில்லை",
    maxAge: "அதிகபட்ச வரம்பில்லை",
    minAgeLabel: "குறைந்தபட்ச வயது",
    maxAgeLabel: "அதிகபட்ச வயது",
    filterHint:
      "தற்செயலாகத் தேர்ந்தெடுக்கப்பட்ட அதிகபட்சம் 300 நபர்கள் சரிபார்க்கப்படுவர். பொருத்தமான நபர் கிடைக்காவிட்டால் மீண்டும் முயலவும்.",
    resetFilters: "வடிகட்டிகளை நீக்கு",
    draw: "தற்செயலாக ஒருவரைத் தேர்ந்தெடு",
    loading: "ஏற்றப்படுகிறது…",
    cancel: "ரத்து செய்",
    usage: "பயன்பாட்டு எடுத்துக்காட்டுகள்",
    usageIntro:
      "ஆங்கிலத்தில் அல்லது தேர்ந்தெடுத்த நபரின் மொழியில் உரையாட ஓர் AI முகவரைத் துணையாக்க, ப்ராம்ப்ட்டில் அந்த நபரின் பின்னணித் தகவலைச் சேர்க்கவும். காட்டப்படும் நபரின் பின்னணித் தகவல் எடுத்துக்காட்டுகளில் தானாகச் சேர்க்கப்படும்.",
    englishExample: "ஆங்கில உரையாடலுக்கான ப்ராம்ப்ட்",
    localExample: "{language} பயிற்சிக்கான ப்ராம்ப்ட்",
    promptCopy: "ப்ராம்ப்ட்டை நகலெடு",
    promptWaiting:
      "ஒருவரின் பின்னணித் தகவலுடன் ப்ராம்ப்ட்டைப் பார்க்க, அவரைத் தேர்ந்தெடுக்கவும்.",
    background: "பின்னணித் தகவல்",
    persona: "நபர்",
    unknownName: "பெயர் கிடைக்கவில்லை",
    backgroundText: "பின்னணித் தகவலின் உரை",
    allFields: "அனைத்துப் புலங்களும்",
    outputFormat: "வெளியீட்டு வடிவம்",
    copy: "நகலெடு",
    save: "சேமி",
    replayUrl: "இந்த நபருக்கான இணைப்பு",
    outputPlaceholder: "Hugging Face-இலிருந்து ஒரு நபரை ஏற்றவும்.",
    outputLabel: "நகலெடுக்க வேண்டிய பின்னணித் தகவல்",
    chars: "{count} எழுத்துகள்",
    datasetUsed: "பயன்படுத்திய தரவுத்தொகுப்பு",
    sourceWaiting: "ஏற்றியதும் தரவுத்தொகுப்பு காட்டப்படும்.",
    rows: "{count} வரிசைகள்",
    unverified: "கிடைக்கவில்லை",
    checkLicense: "தரவுத்தொகுப்பின் உரிமத்தைப் பார்க்கவும்",
    manualCopy: "கைமுறையாக நகலெடு",
    manualCopyHint:
      "தானாக நகலெடுக்க உலாவி அனுமதிக்கவில்லை. தேர்ந்தெடுக்கப்பட்ட உரையைக் கைமுறையாக நகலெடுக்கவும்.",
    selectAll: "அனைத்தையும் தேர்ந்தெடு",
    close: "மூடு",
    noScript: "இந்தக் கருவியைப் பயன்படுத்த JavaScript-ஐ இயக்கவும்.",
    basicInfo: "அடிப்படைத் தகவல்",
    personaLabel: "சுயவிவரம்",
    rawDataNote: "நபரின் பின்னணித் தகவல் தரவின் அசல் மொழியில் காட்டப்படும்.",
    promptTemplate:
      "நான் {language} கற்றுக்கொள்கிறேன். கீழே உள்ள பின்னணித் தகவலுக்கு ஏற்ற நபராக நடித்து, என்னுடன் {language} மொழியில் உரையாடிப் பயிற்சி அளிக்கவும். முதலில் சுருக்கமாக உங்களை அறிமுகப்படுத்திக்கொள்ளவும், ஒவ்வொரு முறையும் ஒரு கேள்வி மட்டும் கேட்டு என் பதிலுக்காகக் காத்திருக்கவும். நான் இயல்பற்ற சொற்றொடரைப் பயன்படுத்தினால், உரையாடலைத் தொடர்வதற்கு முன் அதை இயல்பாகச் சொல்வது எப்படி என்பதைச் சுருக்கமாகக் கூறவும்.\n\nநபரின் பின்னணித் தகவல்:\n{background}",
    original: "அசல் மொழி",
    personaLanguage: "பின்னணித் தகவலில் குறிப்பிடப்பட்ட மொழி",
    uiChanged: "இடைமுக மொழி மாற்றப்பட்டது.",
    fetching: "Hugging Face-இலிருந்து பெறப்படுகிறது…",
    previousResult: "முந்தைய முடிவு இன்னும் காட்டப்படுகிறது.",
    cancelled: "ஏற்றுவது ரத்து செய்யப்பட்டது.",
    fetchFailed: "ஏற்ற முடியவில்லை.",
    searching: "பொருத்தமான நபர் தேடப்படுகிறார்… {round} / 3",
    drew: "தற்செயலாக ஒரு நபர் தேர்ந்தெடுக்கப்பட்டார்.",
    drewFiltered:
      "தற்செயலாகத் தேர்ந்தெடுக்கப்பட்ட {count} நபர்களிலிருந்து ஒருவர் தேர்வானார்.",
    partial:
      "API மூலம் கிடைக்கும் தரவிலிருந்து மட்டுமே தேர்வு செய்யப்படுகிறது.",
    revisionMissing:
      "இந்தப் பதிலில் தரவின் திருத்தப் பதிப்பு குறிப்பிடப்படவில்லை.",
    addressUnavailable:
      "முகவரிப் பட்டியைப் புதுப்பிக்க முடியவில்லை. அதற்குப் பதிலாக “இந்த நபருக்கான இணைப்பு” என்பதை நகலெடுக்கவும்.",
    restoring: "URL-இல் பதிவான நபர் ஏற்றப்படுகிறார்…",
    restoredVerified:
      "URL-இல் பதிவான வரிசை இடம், திருத்தப் பதிப்பு மற்றும் UUID உறுதிசெய்யப்பட்டன.",
    restored: "குறிப்பிட்ட வரிசை ஏற்றப்பட்டது.",
    replayEnriched:
      "இந்த நபரின் இணைப்பில் திருத்தப் பதிப்பும் UUID-யும் சேர்க்கப்பட்டன.",
    replayUnverified:
      "இந்தப் பதிலைக் கொண்டு திருத்தப் பதிப்பையோ UUID-யையோ சரிபார்க்க முடியாது.",
    copied: "காட்டப்பட்ட உரை நகலெடுக்கப்பட்டது.",
    promptCopied: "ப்ராம்ப்ட் நகலெடுக்கப்பட்டது.",
    urlCopied: "இந்த நபருக்கான இணைப்பு நகலெடுக்கப்பட்டது.",
    saving: "தற்போதைய வெளியீடு கோப்பில் சேமிக்கப்படுகிறது.",
    conditionsChanged:
      "தேர்வு நிபந்தனைகள் மாற்றப்பட்டன. அடுத்த தற்செயல் தேர்வில் அவை பயன்படுத்தப்படும்.",
    dataLanguageChanged:
      "தரவின் மொழி மாற்றப்பட்டது. அடுத்த தற்செயல் தேர்வில் அது பயன்படுத்தப்படும்.",
    filtersReset: "அடுத்த தற்செயல் தேர்வுக்கான வடிகட்டிகள் நீக்கப்பட்டன.",
    fields: {
      cultural_background: "பண்பாடும் வளர்ப்பும்",
      skills_and_expertise: "திறன்களும் நிபுணத்துவமும்",
      hobbies_and_interests: "பொழுதுபோக்குகளும் ஆர்வங்களும்",
      career_goals_and_ambitions: "இலக்குகளும் விருப்பங்களும்",
      linguistic_background: "மொழிப் பின்னணி",
      linguistic_persona: "மொழிச் சுயவிவரம்",
      family_persona: "குடும்பச் சுயவிவரம்",
      age: "வயது",
      sex: "பாலினம்",
      occupation: "தொழில்",
      country: "நாடு",
      education_level: "கல்வி நிலை",
      education_degree: "பட்டம்",
      bachelors_field: "படிப்புத் துறை",
      marital_status: "திருமண நிலை",
      prefecture: "பிரிஃபெக்சர்",
      city: "நகரம்",
      state: "மாநிலம்",
      region: "பிராந்தியம்",
      area: "பகுதி",
      district: "மாவட்டம்",
      province: "மாகாணம்",
      zone: "குடியிருப்பு மண்டலம்",
      municipality: "நகராட்சி",
      commune: "கம்யூன்",
      departement: "நிர்வாகப் பிரிவு",
      department: "நிர்வாகப் பிரிவு",
      planning_area: "திட்டமிடல் பகுதி",
      zipcode: "அஞ்சல் குறியீடு",
      industry: "தொழில் துறை",
      first_language: "முதல் மொழி",
      second_language: "இரண்டாம் மொழி",
      third_language: "மூன்றாம் மொழி",
      languages_spoken: "பேசும் மொழிகள்",
      household_type: "ஒரே வீட்டில் வசிப்போரின் அமைப்பு",
      family_type: "குடும்ப வகை",
      housing_type: "வீட்டுவசதி",
      military_status: "ராணுவச் சேவை நிலை",
    },
    siteTitle: "எதிர்பாரா சந்திப்பு",
  },
  te: {
    uiLanguage: "ఇంటర్‌ఫేస్ భాష",
    synthetic: "కృత్రిమంగా రూపొందించిన వ్యక్తుల డేటా",
    controls: "ఎంపిక",
    dataset: "దేశం / డేటాసెట్",
    dataLanguage: "డేటా భాష",
    allCountries: "అన్ని దేశాలు",
    defaultLanguages: "ప్రతి దేశానికి డిఫాల్ట్ భాష",
    allHint:
      "ప్రతి దేశాన్ని ఎంచుకునే అవకాశం సమానంగా ఉంటుంది. భారతదేశం, బెల్జియం కోసం ఆంగ్ల సంస్కరణలు ఉపయోగించబడతాయి.",
    filters: "ఫిల్టర్లు",
    optional: "ఐచ్ఛికం",
    sex: "లింగం",
    any: "ఏదైనా",
    female: "స్త్రీ",
    male: "పురుషుడు",
    age: "వయస్సు",
    minAge: "కనిష్ఠ పరిమితి లేదు",
    maxAge: "గరిష్ఠ పరిమితి లేదు",
    minAgeLabel: "కనిష్ఠ వయస్సు",
    maxAgeLabel: "గరిష్ఠ వయస్సు",
    filterHint:
      "యాదృచ్ఛికంగా ఎంచుకున్న గరిష్ఠంగా 300 మందిని తనిఖీ చేస్తుంది. సరిపోయే వ్యక్తి దొరకకపోతే మళ్లీ ప్రయత్నించండి.",
    resetFilters: "ఫిల్టర్లను తొలగించండి",
    draw: "యాదృచ్ఛికంగా ఒకరిని ఎంచుకోండి",
    loading: "లోడ్ అవుతోంది…",
    cancel: "రద్దు చేయండి",
    usage: "వినియోగ ఉదాహరణలు",
    usageIntro:
      "ఆంగ్లంలో లేదా ఎంచుకున్న వ్యక్తి భాషలో సంభాషించే తోడుగా AI ఏజెంట్‌ను ఉపయోగించడానికి, ఆ వ్యక్తి నేపథ్యాన్ని ప్రాంప్ట్‌లో చేర్చండి. చూపిస్తున్న వ్యక్తి నేపథ్యం ఉదాహరణల్లో స్వయంచాలకంగా చేరుతుంది.",
    englishExample: "ఆంగ్ల సంభాషణ కోసం ప్రాంప్ట్",
    localExample: "{language} అభ్యాసం కోసం ప్రాంప్ట్",
    promptCopy: "ప్రాంప్ట్‌ను కాపీ చేయండి",
    promptWaiting:
      "ఒకరి నేపథ్యంతో కూడిన ప్రాంప్ట్‌ను చూడటానికి వ్యక్తిని ఎంచుకోండి.",
    background: "నేపథ్యం",
    persona: "వ్యక్తి",
    unknownName: "పేరు అందుబాటులో లేదు",
    backgroundText: "నేపథ్య వచనం",
    allFields: "అన్ని ఫీల్డ్‌లు",
    outputFormat: "అవుట్‌పుట్ ఆకృతి",
    copy: "కాపీ చేయండి",
    save: "భద్రపరచండి",
    replayUrl: "ఈ వ్యక్తి లింక్",
    outputPlaceholder: "Hugging Face నుంచి ఒక వ్యక్తిని లోడ్ చేయండి.",
    outputLabel: "కాపీ చేయాల్సిన నేపథ్యం",
    chars: "{count} అక్షరాలు",
    datasetUsed: "ఉపయోగించిన డేటాసెట్",
    sourceWaiting: "లోడ్ అయిన తర్వాత డేటాసెట్ కనిపిస్తుంది.",
    rows: "{count} వరుసలు",
    unverified: "అందుబాటులో లేదు",
    checkLicense: "డేటాసెట్ లైసెన్స్‌ను చూడండి",
    manualCopy: "మీరే కాపీ చేయండి",
    manualCopyHint:
      "స్వయంచాలకంగా కాపీ చేయడానికి బ్రౌజర్ అనుమతించలేదు. ఎంచుకున్న వచనాన్ని మీరే కాపీ చేయండి.",
    selectAll: "అన్నింటినీ ఎంచుకోండి",
    close: "మూసివేయండి",
    noScript: "ఈ సాధనాన్ని ఉపయోగించడానికి JavaScript‌ను ప్రారంభించండి.",
    basicInfo: "ప్రాథమిక సమాచారం",
    personaLabel: "వ్యక్తి పరిచయం",
    rawDataNote: "వ్యక్తి నేపథ్యం డేటా అసలు భాషలో చూపబడుతుంది.",
    promptTemplate:
      "నేను {language} నేర్చుకుంటున్నాను. కింద ఇచ్చిన నేపథ్యంలోని వ్యక్తిగా నటించి, నాతో {language} భాషలో సంభాషణ సాధన చేయించండి. ముందుగా మిమ్మల్ని మీరు క్లుప్తంగా పరిచయం చేసుకోండి, ఒక్కోసారి ఒక్క ప్రశ్న అడిగి నా సమాధానం కోసం వేచి ఉండండి. నేను అసహజమైన పదబంధాన్ని వాడితే, సంభాషణ కొనసాగించే ముందు దాన్ని సహజంగా ఎలా చెప్పాలో క్లుప్తంగా తెలియజేయండి.\n\nవ్యక్తి నేపథ్యం:\n{background}",
    original: "అసలు భాష",
    personaLanguage: "నేపథ్యంలో పేర్కొన్న భాష",
    uiChanged: "ఇంటర్‌ఫేస్ భాష మార్చబడింది.",
    fetching: "Hugging Face నుంచి పొందుతోంది…",
    previousResult: "మునుపటి ఫలితం ఇంకా కనిపిస్తోంది.",
    cancelled: "లోడ్ చేయడం రద్దయింది.",
    fetchFailed: "లోడ్ చేయడం విఫలమైంది.",
    searching: "సరిపోయే వ్యక్తి కోసం వెతుకుతోంది… {round} / 3",
    drew: "యాదృచ్ఛికంగా ఒక వ్యక్తిని ఎంచుకుంది.",
    drewFiltered: "యాదృచ్ఛికంగా ఎంచుకున్న {count} మందిలో నుంచి ఎంపిక చేసింది.",
    partial: "ఎంపిక API ద్వారా అందుబాటులో ఉన్న డేటాకు పరిమితం.",
    revisionMissing: "ఈ ప్రతిస్పందనలో డేటా సంస్కరణ వివరాలు లేవు.",
    addressUnavailable:
      "చిరునామా పట్టీని నవీకరించలేకపోయింది. బదులుగా “ఈ వ్యక్తి లింక్”ను కాపీ చేయండి.",
    restoring: "URLలో నమోదైన వ్యక్తిని లోడ్ చేస్తోంది…",
    restoredVerified:
      "URLలో నమోదైన వరుస స్థానం, సంస్కరణ, UUID నిర్ధారించబడ్డాయి.",
    restored: "పేర్కొన్న వరుస లోడ్ అయింది.",
    replayEnriched: "ఈ వ్యక్తి లింక్‌కు సంస్కరణ, UUID జోడించబడ్డాయి.",
    replayUnverified:
      "ఈ ప్రతిస్పందనతో సంస్కరణ లేదా UUIDను ధృవీకరించడం సాధ్యం కాదు.",
    copied: "చూపిస్తున్న వచనం కాపీ అయింది.",
    promptCopied: "ప్రాంప్ట్ కాపీ అయింది.",
    urlCopied: "ఈ వ్యక్తి లింక్ కాపీ అయింది.",
    saving: "ప్రస్తుత అవుట్‌పుట్‌ను ఫైల్‌లో భద్రపరుస్తోంది.",
    conditionsChanged:
      "ఎంపిక నిబంధనలు మార్చబడ్డాయి. అవి తదుపరి యాదృచ్ఛిక ఎంపికకు వర్తిస్తాయి.",
    dataLanguageChanged:
      "డేటా భాష మార్చబడింది. అది తదుపరి యాదృచ్ఛిక ఎంపికకు వర్తిస్తుంది.",
    filtersReset: "తదుపరి యాదృచ్ఛిక ఎంపిక కోసం ఫిల్టర్లు తొలగించబడ్డాయి.",
    fields: {
      cultural_background: "సంస్కృతి, పెంపకం",
      skills_and_expertise: "నైపుణ్యాలు, ప్రావీణ్యం",
      hobbies_and_interests: "అభిరుచులు, ఆసక్తులు",
      career_goals_and_ambitions: "లక్ష్యాలు, ఆశయాలు",
      linguistic_background: "భాషా నేపథ్యం",
      linguistic_persona: "భాషా పరిచయం",
      family_persona: "కుటుంబ పరిచయం",
      age: "వయస్సు",
      sex: "లింగం",
      occupation: "వృత్తి",
      country: "దేశం",
      education_level: "విద్యా స్థాయి",
      education_degree: "డిగ్రీ",
      bachelors_field: "అధ్యయన విభాగం",
      marital_status: "వైవాహిక స్థితి",
      prefecture: "ప్రిఫెక్చర్",
      city: "నగరం",
      state: "రాష్ట్రం",
      region: "ప్రాంతం",
      area: "పరిసర ప్రాంతం",
      district: "జిల్లా",
      province: "ప్రావిన్స్",
      zone: "నివాస మండలం",
      municipality: "పురపాలక ప్రాంతం",
      commune: "కమ్యూన్",
      departement: "పరిపాలనా విభాగం",
      department: "పరిపాలనా విభాగం",
      planning_area: "ప్రణాళికా ప్రాంతం",
      zipcode: "తపాలా కోడ్",
      industry: "పరిశ్రమ",
      first_language: "మొదటి భాష",
      second_language: "రెండో భాష",
      third_language: "మూడో భాష",
      languages_spoken: "మాట్లాడే భాషలు",
      household_type: "ఒకే ఇంట్లో నివసించేవారి సమూహ రకం",
      family_type: "కుటుంబ రకం",
      housing_type: "గృహ వసతి",
      military_status: "సైనిక సేవా స్థితి",
    },
    siteTitle: "అనుకోని పరిచయం",
  },
  mr: {
    uiLanguage: "प्रदर्शनाची भाषा",
    synthetic: "कृत्रिम व्यक्तींची माहिती",
    controls: "निवड",
    dataset: "देश / डेटासेट",
    dataLanguage: "माहितीची भाषा",
    allCountries: "सर्व देशांमधून",
    defaultLanguages: "प्रत्येक देशाची पूर्वनिर्धारित भाषा",
    allHint:
      "प्रत्येक देश निवडला जाण्याची शक्यता समान आहे. भारत आणि बेल्जियमसाठी इंग्रजी आवृत्त्या वापरल्या जातात.",
    filters: "निवडीच्या अटी",
    optional: "ऐच्छिक",
    sex: "लिंग",
    any: "कोणतेही",
    female: "स्त्री",
    male: "पुरुष",
    age: "वय",
    minAge: "किमान मर्यादा नाही",
    maxAge: "कमाल मर्यादा नाही",
    minAgeLabel: "किमान वय",
    maxAgeLabel: "कमाल वय",
    filterHint:
      "यादृच्छिकपणे निवडलेल्या जास्तीत जास्त 300 व्यक्ती तपासल्या जातात. योग्य व्यक्ती न मिळाल्यास पुन्हा प्रयत्न करा.",
    resetFilters: "अटी काढून टाका",
    draw: "यादृच्छिक व्यक्ती निवडा",
    loading: "माहिती मिळवत आहे…",
    cancel: "रद्द करा",
    usage: "वापराची उदाहरणे",
    usageIntro:
      "पार्श्वभूमी प्रॉम्प्टमध्ये वापरून AI एजंटसोबत इंग्रजी किंवा त्या व्यक्तीच्या भाषेत संभाषणाचा सराव करता येतो. उदाहरणांमध्ये सध्या दिसणाऱ्या व्यक्तीची पार्श्वभूमी आपोआप समाविष्ट होते.",
    englishExample: "इंग्रजी संभाषणासाठी प्रॉम्प्ट",
    localExample: "{language} सरावासाठी प्रॉम्प्ट",
    promptCopy: "प्रॉम्प्ट कॉपी करा",
    promptWaiting:
      "व्यक्तीची माहिती मिळाल्यावर तिच्या पार्श्वभूमीसह प्रॉम्प्ट दिसेल.",
    background: "पार्श्वभूमी",
    persona: "व्यक्ती",
    unknownName: "नाव उपलब्ध नाही",
    backgroundText: "पार्श्वभूमीचा मजकूर",
    allFields: "सर्व तपशील",
    outputFormat: "मजकुराचे स्वरूप",
    copy: "कॉपी करा",
    save: "जतन करा",
    replayUrl: "या व्यक्तीची लिंक",
    outputPlaceholder: "Hugging Face वरून व्यक्तीची माहिती मिळवा.",
    outputLabel: "कॉपी करण्यासाठी पार्श्वभूमी",
    chars: "{count} अक्षरे",
    datasetUsed: "वापरलेला डेटासेट",
    sourceWaiting: "माहिती मिळाल्यावर डेटासेट दिसेल.",
    rows: "{count} नोंदी",
    unverified: "उपलब्ध नाही",
    checkLicense: "डेटासेटचा परवाना तपासा",
    manualCopy: "स्वतः कॉपी करा",
    manualCopyHint:
      "ब्राउझरने आपोआप कॉपी करण्याची परवानगी दिली नाही. निवडलेला मजकूर स्वतः कॉपी करा.",
    selectAll: "सर्व निवडा",
    close: "बंद करा",
    noScript: "हे साधन वापरण्यासाठी JavaScript सुरू करा.",
    basicInfo: "मूलभूत माहिती",
    personaLabel: "व्यक्तीचा परिचय",
    rawDataNote: "व्यक्तीची पार्श्वभूमी मूळ माहितीच्या भाषेत दाखवली जाते.",
    promptTemplate:
      "मी {language} शिकत आहे. खालील पार्श्वभूमी असलेल्या व्यक्तीची भूमिका घेऊन माझ्याशी {language}मध्ये संभाषणाचा सराव करा. थोडक्यात स्वतःची ओळख करून द्या, एका वेळी एकच प्रश्न विचारा आणि माझ्या उत्तराची वाट पाहा. माझे एखादे वाक्य अनैसर्गिक वाटल्यास, ते थोडक्यात अधिक नैसर्गिकपणे सांगून संभाषण पुढे चालू ठेवा.\n\nव्यक्तीची पार्श्वभूमी:\n{background}",
    original: "मूळ भाषा",
    personaLanguage: "पार्श्वभूमीत नमूद केलेली भाषा",
    uiChanged: "प्रदर्शनाची भाषा बदलली.",
    fetching: "Hugging Face वरून माहिती मिळवत आहे…",
    previousResult: "आधीचा निकाल अजूनही दिसत आहे.",
    cancelled: "माहिती मिळवणे रद्द केले.",
    fetchFailed: "माहिती मिळवता आली नाही.",
    searching: "अटींशी जुळणारी व्यक्ती शोधत आहे… {round} / 3",
    drew: "एक व्यक्ती यादृच्छिकपणे निवडली.",
    drewFiltered: "{count} यादृच्छिक उमेदवारांमधून निवड केली.",
    partial: "निवड API द्वारे उपलब्ध असलेल्या माहितीपुरती मर्यादित आहे.",
    revisionMissing: "या प्रतिसादातून माहितीची आवृत्ती निश्चित करता येत नाही.",
    addressUnavailable:
      "अॅड्रेस बार अद्ययावत करता आला नाही. “या व्यक्तीची लिंक” कॉपी करा.",
    restoring: "URL मध्ये नोंदवलेली व्यक्ती पुन्हा दाखवत आहे…",
    restoredVerified:
      "URL मधील नोंदीचे स्थान, आवृत्ती आणि UUID जुळत असल्याची खात्री झाली.",
    restored: "दिलेल्या स्थानावरील नोंद दाखवली.",
    replayEnriched: "व्यक्तीच्या लिंकमध्ये आवृत्ती आणि UUID जोडले.",
    replayUnverified:
      "या प्रतिसादातून आवृत्ती किंवा UUID निश्चित करता येत नाही.",
    copied: "दिसणारा मजकूर कॉपी केला.",
    promptCopied: "प्रॉम्प्ट कॉपी केला.",
    urlCopied: "व्यक्तीची लिंक कॉपी केली.",
    saving: "सध्याचा मजकूर फाइलमध्ये जतन करत आहे.",
    conditionsChanged:
      "निवडीच्या अटी बदलल्या. पुढील निवडीपासून त्या लागू होतील.",
    dataLanguageChanged: "माहितीची भाषा बदलली. पुढील निवडीपासून ती लागू होईल.",
    filtersReset: "पुढील निवडीच्या अटी काढून टाकल्या.",
    fields: {
      cultural_background: "संस्कृती आणि बालपण",
      skills_and_expertise: "कौशल्ये आणि तज्ज्ञता",
      hobbies_and_interests: "छंद आणि आवडी",
      career_goals_and_ambitions: "ध्येये आणि महत्त्वाकांक्षा",
      linguistic_background: "भाषिक पार्श्वभूमी",
      linguistic_persona: "भाषिक परिचय",
      family_persona: "कौटुंबिक परिचय",
      age: "वय",
      sex: "लिंग",
      occupation: "व्यवसाय",
      country: "देश",
      education_level: "शिक्षणाचा स्तर",
      education_degree: "शैक्षणिक पदवी",
      bachelors_field: "शिक्षणाची शाखा",
      marital_status: "वैवाहिक स्थिती",
      prefecture: "प्रशासकीय प्रांत",
      city: "शहर",
      state: "राज्य",
      region: "प्रदेश",
      area: "परिसर",
      district: "जिल्हा",
      province: "प्रांत",
      zone: "निवास क्षेत्र",
      municipality: "नगरपालिका",
      commune: "स्थानिक प्रशासकीय विभाग",
      departement: "प्रशासकीय विभाग",
      department: "प्रशासकीय विभाग",
      planning_area: "नियोजन क्षेत्र",
      zipcode: "टपाल संकेतांक",
      industry: "उद्योगक्षेत्र",
      first_language: "पहिली भाषा",
      second_language: "दुसरी भाषा",
      third_language: "तिसरी भाषा",
      languages_spoken: "बोलल्या जाणाऱ्या भाषा",
      household_type: "घरातील सदस्यरचनेचा प्रकार",
      family_type: "कुटुंबाची रचना",
      housing_type: "निवासाचा प्रकार",
      military_status: "लष्करी सेवेची स्थिती",
    },
    siteTitle: "अवचित भेट",
  },
  gu: {
    uiLanguage: "પ્રદર્શનની ભાષા",
    synthetic: "કૃત્રિમ વ્યક્તિઓની માહિતી",
    controls: "પસંદગી",
    dataset: "દેશ / ડેટાસેટ",
    dataLanguage: "માહિતીની ભાષા",
    allCountries: "બધા દેશોમાંથી",
    defaultLanguages: "દરેક દેશની મૂળભૂત ભાષા",
    allHint:
      "દરેક દેશ પસંદ થવાની શક્યતા સમાન છે. ભારત અને બેલ્જિયમ માટે અંગ્રેજી આવૃત્તિઓ વપરાય છે.",
    filters: "પસંદગીની શરતો",
    optional: "વૈકલ્પિક",
    sex: "લિંગ",
    any: "કોઈપણ",
    female: "સ્ત્રી",
    male: "પુરુષ",
    age: "ઉંમર",
    minAge: "લઘુત્તમ મર્યાદા નથી",
    maxAge: "મહત્તમ મર્યાદા નથી",
    minAgeLabel: "લઘુત્તમ ઉંમર",
    maxAgeLabel: "મહત્તમ ઉંમર",
    filterHint:
      "વધુમાં વધુ 300 રેન્ડમ વ્યક્તિઓ તપાસવામાં આવે છે. યોગ્ય વ્યક્તિ ન મળે તો ફરી પ્રયાસ કરો.",
    resetFilters: "શરતો દૂર કરો",
    draw: "રેન્ડમ વ્યક્તિ પસંદ કરો",
    loading: "માહિતી મેળવી રહ્યાં છીએ…",
    cancel: "રદ કરો",
    usage: "ઉપયોગનાં ઉદાહરણો",
    usageIntro:
      "પૃષ્ઠભૂમિને પ્રોમ્પ્ટમાં વાપરીને AI એજન્ટ સાથે અંગ્રેજી અથવા તે વ્યક્તિની ભાષામાં વાતચીતનો અભ્યાસ કરી શકાય છે. ઉદાહરણોમાં હાલમાં દેખાતી વ્યક્તિની પૃષ્ઠભૂમિ આપમેળે ઉમેરાય છે.",
    englishExample: "અંગ્રેજી વાતચીત માટેનો પ્રોમ્પ્ટ",
    localExample: "{language}ના અભ્યાસ માટેનો પ્રોમ્પ્ટ",
    promptCopy: "પ્રોમ્પ્ટ કૉપી કરો",
    promptWaiting:
      "વ્યક્તિની માહિતી મળ્યા પછી તેની પૃષ્ઠભૂમિ સાથેનો પ્રોમ્પ્ટ દેખાશે.",
    background: "પૃષ્ઠભૂમિ",
    persona: "વ્યક્તિ",
    unknownName: "નામ ઉપલબ્ધ નથી",
    backgroundText: "પૃષ્ઠભૂમિનું લખાણ",
    allFields: "બધી વિગતો",
    outputFormat: "લખાણનું સ્વરૂપ",
    copy: "કૉપી કરો",
    save: "સાચવો",
    replayUrl: "આ વ્યક્તિની લિંક",
    outputPlaceholder: "Hugging Face પરથી વ્યક્તિની માહિતી મેળવો.",
    outputLabel: "કૉપી કરવા માટેની પૃષ્ઠભૂમિ",
    chars: "{count} અક્ષરો",
    datasetUsed: "વપરાયેલ ડેટાસેટ",
    sourceWaiting: "માહિતી મળ્યા પછી ડેટાસેટ દેખાશે.",
    rows: "{count} નોંધો",
    unverified: "ઉપલબ્ધ નથી",
    checkLicense: "ડેટાસેટનું લાઇસન્સ તપાસો",
    manualCopy: "જાતે કૉપી કરો",
    manualCopyHint:
      "બ્રાઉઝરે આપમેળે કૉપી કરવાની મંજૂરી આપી નથી. પસંદ કરેલું લખાણ જાતે કૉપી કરો.",
    selectAll: "બધું પસંદ કરો",
    close: "બંધ કરો",
    noScript: "આ સાધન વાપરવા માટે JavaScript ચાલુ કરો.",
    basicInfo: "મૂળભૂત માહિતી",
    personaLabel: "વ્યક્તિનો પરિચય",
    rawDataNote: "વ્યક્તિની પૃષ્ઠભૂમિ મૂળ માહિતીની ભાષામાં બતાવવામાં આવે છે.",
    promptTemplate:
      "હું {language} શીખું છું. નીચે આપેલી પૃષ્ઠભૂમિ ધરાવતી વ્યક્તિની ભૂમિકા ભજવો અને મારી સાથે {language}માં વાતચીતનો અભ્યાસ કરો. તમારો ટૂંકો પરિચય આપીને શરૂઆત કરો, એક સમયે એક જ પ્રશ્ન પૂછો અને મારા જવાબની રાહ જુઓ. મારી કોઈ અભિવ્યક્તિ અસ્વાભાવિક હોય તો તેને ટૂંકમાં વધુ સ્વાભાવિક રીતે કહીને વાતચીત આગળ વધારો.\n\nવ્યક્તિની પૃષ્ઠભૂમિ:\n{background}",
    original: "મૂળ ભાષા",
    personaLanguage: "પૃષ્ઠભૂમિમાં જણાવેલી ભાષા",
    uiChanged: "પ્રદર્શનની ભાષા બદલાઈ છે.",
    fetching: "Hugging Face પરથી માહિતી મેળવી રહ્યાં છીએ…",
    previousResult: "પહેલાનું પરિણામ હજી દેખાય છે.",
    cancelled: "માહિતી મેળવવાનું રદ કર્યું.",
    fetchFailed: "માહિતી મેળવી શકાઈ નથી.",
    searching: "શરતો સાથે મેળ ખાતી વ્યક્તિ શોધી રહ્યાં છીએ… {round} / 3",
    drew: "એક વ્યક્તિ રેન્ડમ રીતે પસંદ કરી.",
    drewFiltered: "{count} રેન્ડમ ઉમેદવારોમાંથી પસંદગી કરી.",
    partial: "પસંદગી API દ્વારા ઉપલબ્ધ માહિતી પૂરતી મર્યાદિત છે.",
    revisionMissing: "આ પ્રતિસાદથી માહિતીની આવૃત્તિની ખાતરી થઈ શકતી નથી.",
    addressUnavailable:
      "એડ્રેસ બાર અપડેટ થઈ શક્યો નથી. “આ વ્યક્તિની લિંક” કૉપી કરો.",
    restoring: "URLમાં નોંધાયેલી વ્યક્તિ ફરી બતાવી રહ્યાં છીએ…",
    restoredVerified:
      "URLમાં નોંધાયેલ સ્થાન, આવૃત્તિ અને UUID મેળ ખાય છે તેની ખાતરી થઈ.",
    restored: "આપેલા સ્થાનની નોંધ બતાવી.",
    replayEnriched: "વ્યક્તિની લિંકમાં આવૃત્તિ અને UUID ઉમેર્યાં.",
    replayUnverified: "આ પ્રતિસાદથી આવૃત્તિ અથવા UUIDની ખાતરી થઈ શકતી નથી.",
    copied: "દેખાતું લખાણ કૉપી કર્યું.",
    promptCopied: "પ્રોમ્પ્ટ કૉપી કર્યો.",
    urlCopied: "વ્યક્તિની લિંક કૉપી કરી.",
    saving: "હાલનું લખાણ ફાઇલમાં સાચવી રહ્યાં છીએ.",
    conditionsChanged: "પસંદગીની શરતો બદલાઈ છે. તે આગલી પસંદગીથી લાગુ પડશે.",
    dataLanguageChanged: "માહિતીની ભાષા બદલાઈ છે. તે આગલી પસંદગીથી લાગુ પડશે.",
    filtersReset: "આગલી પસંદગીની શરતો દૂર કરી.",
    fields: {
      cultural_background: "સંસ્કૃતિ અને ઉછેર",
      skills_and_expertise: "કૌશલ્યો અને નિપુણતા",
      hobbies_and_interests: "શોખ અને રુચિઓ",
      career_goals_and_ambitions: "લક્ષ્યો અને મહત્ત્વાકાંક્ષાઓ",
      linguistic_background: "ભાષાકીય પૃષ્ઠભૂમિ",
      linguistic_persona: "ભાષાકીય પરિચય",
      family_persona: "કૌટુંબિક પરિચય",
      age: "ઉંમર",
      sex: "લિંગ",
      occupation: "વ્યવસાય",
      country: "દેશ",
      education_level: "શિક્ષણનું સ્તર",
      education_degree: "શૈક્ષણિક પદવી",
      bachelors_field: "અભ્યાસનું ક્ષેત્ર",
      marital_status: "વૈવાહિક સ્થિતિ",
      prefecture: "વહીવટી પ્રાંત",
      city: "શહેર",
      state: "રાજ્ય",
      region: "પ્રદેશ",
      area: "વિસ્તાર",
      district: "જિલ્લો",
      province: "પ્રાંત",
      zone: "રહેઠાણનો વિસ્તાર",
      municipality: "નગરપાલિકા",
      commune: "સ્થાનિક વહીવટી એકમ",
      departement: "વહીવટી વિભાગ",
      department: "વહીવટી વિભાગ",
      planning_area: "આયોજન વિસ્તાર",
      zipcode: "ટપાલ કોડ",
      industry: "ઉદ્યોગક્ષેત્ર",
      first_language: "પ્રથમ ભાષા",
      second_language: "બીજી ભાષા",
      third_language: "ત્રીજી ભાષા",
      languages_spoken: "બોલાતી ભાષાઓ",
      household_type: "ઘરના સભ્યોની રચનાનો પ્રકાર",
      family_type: "કુટુંબની રચના",
      housing_type: "રહેઠાણનો પ્રકાર",
      military_status: "લશ્કરી સેવાની સ્થિતિ",
    },
    siteTitle: "અણધારી મુલાકાત",
  },
  id: {
    uiLanguage: "Bahasa antarmuka",
    synthetic: "Data persona sintetis",
    controls: "Pemilihan",
    dataset: "Negara / dataset",
    dataLanguage: "Bahasa data",
    allCountries: "Semua negara",
    defaultLanguages: "Bahasa bawaan setiap negara",
    allHint:
      "Setiap negara memiliki peluang yang sama untuk dipilih. India dan Belgia menggunakan versi bahasa Inggris.",
    filters: "Filter",
    optional: "Opsional",
    sex: "Jenis kelamin",
    any: "Semua",
    female: "Perempuan",
    male: "Laki-laki",
    age: "Usia",
    minAge: "Tanpa batas minimum",
    maxAge: "Tanpa batas maksimum",
    minAgeLabel: "Usia minimum",
    maxAgeLabel: "Usia maksimum",
    filterHint:
      "Memeriksa hingga 300 kandidat acak. Coba lagi jika tidak ada yang cocok.",
    resetFilters: "Hapus filter",
    draw: "Pilih persona secara acak",
    loading: "Memuat…",
    cancel: "Batal",
    usage: "Contoh penggunaan",
    usageIntro:
      "Masukkan latar belakang ke dalam perintah agar agen AI menjadi teman berlatih bahasa Inggris atau bahasa persona. Contoh secara otomatis menyertakan latar belakang persona yang ditampilkan.",
    englishExample: "Contoh perintah percakapan bahasa Inggris",
    localExample: "Contoh perintah latihan {language}",
    promptCopy: "Salin perintah",
    promptWaiting:
      "Pilih persona untuk melihat perintah yang memuat latar belakangnya.",
    background: "Latar belakang",
    persona: "Persona",
    unknownName: "Nama tidak tersedia",
    backgroundText: "Teks latar belakang",
    allFields: "Semua kolom",
    outputFormat: "Format keluaran",
    copy: "Salin",
    save: "Simpan",
    replayUrl: "Tautan ke persona ini",
    outputPlaceholder: "Muat persona dari Hugging Face.",
    outputLabel: "Latar belakang untuk disalin",
    chars: "{count} karakter",
    datasetUsed: "Dataset yang digunakan",
    sourceWaiting: "Dataset akan ditampilkan setelah dimuat.",
    rows: "{count} baris",
    unverified: "Tidak tersedia",
    checkLicense: "Periksa lisensi dataset",
    manualCopy: "Salin secara manual",
    manualCopyHint:
      "Browser tidak mengizinkan penyalinan otomatis. Salin teks yang dipilih secara manual.",
    selectAll: "Pilih semua",
    close: "Tutup",
    noScript: "Aktifkan JavaScript untuk menggunakan alat ini.",
    basicInfo: "Informasi dasar",
    personaLabel: "Profil",
    rawDataNote: "Latar belakang persona ditampilkan dalam bahasa asli data.",
    promptTemplate:
      "Saya sedang belajar {language}. Berperanlah sebagai orang dengan latar belakang di bawah ini dan berlatihlah percakapan dengan saya dalam {language}. Mulailah dengan perkenalan singkat, ajukan satu pertanyaan setiap kali, lalu tunggu jawaban saya. Jika saya menggunakan ungkapan yang kurang alami, berikan perbaikan singkat sebelum melanjutkan percakapan.\n\nLatar belakang persona:\n{background}",
    original: "Bahasa asli",
    personaLanguage: "Bahasa yang disebutkan dalam latar belakang",
    uiChanged: "Bahasa antarmuka diubah.",
    fetching: "Mengambil data dari Hugging Face…",
    previousResult: "Hasil sebelumnya masih ditampilkan.",
    cancelled: "Pemuatan dibatalkan.",
    fetchFailed: "Pemuatan gagal.",
    searching: "Mencari persona yang cocok… {round} / 3",
    drew: "Satu persona dipilih secara acak.",
    drewFiltered: "Dipilih dari {count} kandidat acak.",
    partial: "Pemilihan terbatas pada data yang tersedia melalui API.",
    revisionMissing: "Respons ini tidak menyebutkan revisi data.",
    addressUnavailable:
      "Bilah alamat tidak dapat diperbarui. Salin “Tautan ke persona ini”.",
    restoring: "Memuat persona yang tercatat dalam URL…",
    restoredVerified:
      "Posisi baris, revisi, dan UUID yang tercatat dalam URL telah dikonfirmasi.",
    restored: "Baris yang ditentukan telah dimuat.",
    replayEnriched: "Revisi dan UUID ditambahkan ke tautan persona ini.",
    replayUnverified:
      "Respons ini tidak memungkinkan verifikasi revisi atau UUID.",
    copied: "Teks yang ditampilkan telah disalin.",
    promptCopied: "Perintah telah disalin.",
    urlCopied: "Tautan ke persona ini telah disalin.",
    saving: "Menyimpan keluaran saat ini ke file.",
    conditionsChanged:
      "Syarat pemilihan diubah dan akan berlaku pada pemilihan berikutnya.",
    dataLanguageChanged:
      "Bahasa data diubah dan akan berlaku pada pemilihan berikutnya.",
    filtersReset: "Filter untuk pemilihan berikutnya telah dihapus.",
    fields: {
      cultural_background: "Budaya dan pengasuhan",
      skills_and_expertise: "Keterampilan dan keahlian",
      hobbies_and_interests: "Hobi dan minat",
      career_goals_and_ambitions: "Tujuan dan ambisi",
      linguistic_background: "Latar belakang bahasa",
      linguistic_persona: "Profil bahasa",
      family_persona: "Profil keluarga",
      age: "Usia",
      sex: "Jenis kelamin",
      occupation: "Pekerjaan",
      country: "Negara",
      education_level: "Tingkat pendidikan",
      education_degree: "Gelar",
      bachelors_field: "Bidang studi",
      marital_status: "Status perkawinan",
      prefecture: "Prefektur",
      city: "Kota",
      state: "Negara bagian",
      region: "Wilayah",
      area: "Area",
      district: "Distrik",
      province: "Provinsi",
      zone: "Zona tempat tinggal",
      municipality: "Munisipalitas",
      commune: "Komune",
      departement: "Departemen administratif",
      department: "Departemen administratif",
      planning_area: "Wilayah perencanaan",
      zipcode: "Kode pos",
      industry: "Industri",
      first_language: "Bahasa pertama",
      second_language: "Bahasa kedua",
      third_language: "Bahasa ketiga",
      languages_spoken: "Bahasa yang digunakan",
      household_type: "Jenis rumah tangga",
      family_type: "Jenis keluarga",
      housing_type: "Tempat tinggal",
      military_status: "Status dinas militer",
    },
    siteTitle: "Pertemuan Tak Terduga",
  },
  ms: {
    uiLanguage: "Bahasa antara muka",
    synthetic: "Data persona sintetik",
    controls: "Pemilihan",
    dataset: "Negara / set data",
    dataLanguage: "Bahasa data",
    allCountries: "Semua negara",
    defaultLanguages: "Bahasa lalai bagi setiap negara",
    allHint:
      "Setiap negara mempunyai peluang yang sama untuk dipilih. India dan Belgium menggunakan versi bahasa Inggeris.",
    filters: "Penapis",
    optional: "Pilihan",
    sex: "Jantina",
    any: "Semua",
    female: "Perempuan",
    male: "Lelaki",
    age: "Umur",
    minAge: "Tiada had minimum",
    maxAge: "Tiada had maksimum",
    minAgeLabel: "Umur minimum",
    maxAgeLabel: "Umur maksimum",
    filterHint:
      "Menyemak sehingga 300 calon rawak. Cuba lagi jika tiada padanan ditemukan.",
    resetFilters: "Kosongkan penapis",
    draw: "Pilih persona secara rawak",
    loading: "Memuatkan…",
    cancel: "Batal",
    usage: "Contoh penggunaan",
    usageIntro:
      "Masukkan latar belakang dalam arahan untuk menjadikan ejen AI rakan perbualan dalam bahasa Inggeris atau bahasa persona. Contoh akan menyertakan latar belakang persona yang dipaparkan secara automatik.",
    englishExample: "Contoh arahan perbualan bahasa Inggeris",
    localExample: "Contoh arahan latihan {language}",
    promptCopy: "Salin arahan",
    promptWaiting:
      "Pilih persona untuk melihat arahan yang mengandungi latar belakangnya.",
    background: "Latar belakang",
    persona: "Persona",
    unknownName: "Nama tidak tersedia",
    backgroundText: "Teks latar belakang",
    allFields: "Semua medan",
    outputFormat: "Format output",
    copy: "Salin",
    save: "Simpan",
    replayUrl: "Pautan ke persona ini",
    outputPlaceholder: "Muatkan persona daripada Hugging Face.",
    outputLabel: "Latar belakang untuk disalin",
    chars: "{count} aksara",
    datasetUsed: "Set data yang digunakan",
    sourceWaiting: "Set data akan dipaparkan selepas dimuatkan.",
    rows: "{count} baris",
    unverified: "Tidak tersedia",
    checkLicense: "Semak lesen set data",
    manualCopy: "Salin secara manual",
    manualCopyHint:
      "Pelayar tidak membenarkan penyalinan automatik. Salin teks yang dipilih secara manual.",
    selectAll: "Pilih semua",
    close: "Tutup",
    noScript: "Dayakan JavaScript untuk menggunakan alat ini.",
    basicInfo: "Maklumat asas",
    personaLabel: "Profil",
    rawDataNote: "Latar belakang persona dipaparkan dalam bahasa asal data.",
    promptTemplate:
      "Saya sedang mempelajari {language}. Mainkan peranan sebagai orang yang mempunyai latar belakang di bawah dan berlatih perbualan dengan saya dalam {language}. Mulakan dengan pengenalan diri yang ringkas, ajukan satu soalan pada satu masa, dan tunggu jawapan saya. Jika ungkapan saya kedengaran janggal, berikan pembetulan ringkas sebelum meneruskan perbualan.\n\nLatar belakang persona:\n{background}",
    original: "Bahasa asal",
    personaLanguage: "Bahasa yang dinyatakan dalam latar belakang",
    uiChanged: "Bahasa antara muka telah ditukar.",
    fetching: "Mendapatkan data daripada Hugging Face…",
    previousResult: "Hasil sebelumnya masih dipaparkan.",
    cancelled: "Pemuatan dibatalkan.",
    fetchFailed: "Pemuatan gagal.",
    searching: "Mencari persona yang sepadan… {round} / 3",
    drew: "Satu persona telah dipilih secara rawak.",
    drewFiltered: "Dipilih daripada {count} calon rawak.",
    partial: "Pemilihan terhad kepada data yang tersedia melalui API.",
    revisionMissing: "Respons ini tidak menyatakan semakan data.",
    addressUnavailable:
      "Bar alamat tidak dapat dikemas kini. Salin “Pautan ke persona ini”.",
    restoring: "Memuatkan persona yang direkodkan dalam URL…",
    restoredVerified:
      "Kedudukan baris, semakan dan UUID yang direkodkan dalam URL telah disahkan.",
    restored: "Baris yang ditentukan telah dimuatkan.",
    replayEnriched:
      "Semakan dan UUID telah ditambahkan pada pautan persona ini.",
    replayUnverified:
      "Respons ini tidak membolehkan semakan atau UUID disahkan.",
    copied: "Teks yang dipaparkan telah disalin.",
    promptCopied: "Arahan telah disalin.",
    urlCopied: "Pautan ke persona ini telah disalin.",
    saving: "Menyimpan output semasa ke dalam fail.",
    conditionsChanged:
      "Syarat pemilihan telah diubah dan akan digunakan pada pemilihan seterusnya.",
    dataLanguageChanged:
      "Bahasa data telah ditukar dan akan digunakan pada pemilihan seterusnya.",
    filtersReset: "Penapis untuk pemilihan seterusnya telah dikosongkan.",
    fields: {
      cultural_background: "Budaya dan didikan",
      skills_and_expertise: "Kemahiran dan kepakaran",
      hobbies_and_interests: "Hobi dan minat",
      career_goals_and_ambitions: "Matlamat dan cita-cita",
      linguistic_background: "Latar belakang bahasa",
      linguistic_persona: "Profil bahasa",
      family_persona: "Profil keluarga",
      age: "Umur",
      sex: "Jantina",
      occupation: "Pekerjaan",
      country: "Negara",
      education_level: "Tahap pendidikan",
      education_degree: "Ijazah",
      bachelors_field: "Bidang pengajian",
      marital_status: "Status perkahwinan",
      prefecture: "Prefektur",
      city: "Bandar",
      state: "Negeri",
      region: "Wilayah",
      area: "Kawasan",
      district: "Daerah",
      province: "Provinsi",
      zone: "Zon kediaman",
      municipality: "Perbandaran",
      commune: "Komun",
      departement: "Bahagian pentadbiran",
      department: "Bahagian pentadbiran",
      planning_area: "Kawasan perancangan",
      zipcode: "Poskod",
      industry: "Industri",
      first_language: "Bahasa pertama",
      second_language: "Bahasa kedua",
      third_language: "Bahasa ketiga",
      languages_spoken: "Bahasa pertuturan",
      household_type: "Jenis isi rumah",
      family_type: "Jenis keluarga",
      housing_type: "Kediaman",
      military_status: "Status perkhidmatan tentera",
    },
    siteTitle: "Pertemuan Tak Disangka",
  },
  vi: {
    uiLanguage: "Ngôn ngữ giao diện",
    synthetic: "Dữ liệu nhân vật tổng hợp",
    controls: "Điều kiện chọn",
    dataset: "Quốc gia / bộ dữ liệu",
    dataLanguage: "Ngôn ngữ dữ liệu",
    allCountries: "Tất cả quốc gia",
    defaultLanguages: "Ngôn ngữ mặc định của từng quốc gia",
    allHint:
      "Mỗi quốc gia có xác suất được chọn như nhau. Ấn Độ và Bỉ dùng phiên bản tiếng Anh.",
    filters: "Bộ lọc",
    optional: "Không bắt buộc",
    sex: "Giới tính",
    any: "Bất kỳ",
    female: "Nữ",
    male: "Nam",
    age: "Tuổi",
    minAge: "Không giới hạn tối thiểu",
    maxAge: "Không giới hạn tối đa",
    minAgeLabel: "Tuổi tối thiểu",
    maxAgeLabel: "Tuổi tối đa",
    filterHint:
      "Kiểm tra tối đa 300 ứng viên ngẫu nhiên. Hãy thử lại nếu không tìm thấy kết quả phù hợp.",
    resetFilters: "Xóa bộ lọc",
    draw: "Chọn nhân vật ngẫu nhiên",
    loading: "Đang tải…",
    cancel: "Hủy",
    usage: "Ví dụ sử dụng",
    usageIntro:
      "Đưa thông tin nền vào lời nhắc để biến tác nhân AI thành bạn luyện hội thoại bằng tiếng Anh hoặc ngôn ngữ của nhân vật. Các ví dụ tự động chứa thông tin nền của nhân vật đang hiển thị.",
    englishExample: "Lời nhắc luyện hội thoại tiếng Anh",
    localExample: "Lời nhắc luyện {language}",
    promptCopy: "Sao chép lời nhắc",
    promptWaiting:
      "Chọn một nhân vật để xem lời nhắc chứa thông tin nền của họ.",
    background: "Thông tin nền",
    persona: "Nhân vật",
    unknownName: "Không xác định được tên",
    backgroundText: "Văn bản thông tin nền",
    allFields: "Tất cả trường",
    outputFormat: "Định dạng đầu ra",
    copy: "Sao chép",
    save: "Lưu",
    replayUrl: "Liên kết đến nhân vật này",
    outputPlaceholder: "Tải một nhân vật từ Hugging Face.",
    outputLabel: "Thông tin nền để sao chép",
    chars: "{count} ký tự",
    datasetUsed: "Bộ dữ liệu đang dùng",
    sourceWaiting: "Bộ dữ liệu sẽ hiển thị sau khi tải xong.",
    rows: "{count} dòng",
    unverified: "Không có thông tin",
    checkLicense: "Kiểm tra giấy phép bộ dữ liệu",
    manualCopy: "Sao chép thủ công",
    manualCopyHint:
      "Trình duyệt không cho phép sao chép tự động. Hãy sao chép thủ công văn bản đã chọn.",
    selectAll: "Chọn tất cả",
    close: "Đóng",
    noScript: "Bật JavaScript để sử dụng công cụ này.",
    basicInfo: "Thông tin cơ bản",
    personaLabel: "Hồ sơ nhân vật",
    rawDataNote:
      "Thông tin nền của nhân vật được hiển thị bằng ngôn ngữ gốc của dữ liệu.",
    promptTemplate:
      "Tôi đang học {language}. Hãy đóng vai người có thông tin nền dưới đây và luyện hội thoại bằng {language} với tôi. Bắt đầu bằng phần tự giới thiệu ngắn, mỗi lần chỉ hỏi một câu và chờ tôi trả lời. Nếu tôi dùng cách diễn đạt thiếu tự nhiên, hãy sửa ngắn gọn trước khi tiếp tục trò chuyện.\n\nThông tin nền của nhân vật:\n{background}",
    original: "Ngôn ngữ gốc",
    personaLanguage: "Ngôn ngữ nêu trong thông tin nền",
    uiChanged: "Đã đổi ngôn ngữ giao diện.",
    fetching: "Đang lấy dữ liệu từ Hugging Face…",
    previousResult: "Kết quả trước đó vẫn đang hiển thị.",
    cancelled: "Đã hủy tải dữ liệu.",
    fetchFailed: "Tải dữ liệu thất bại.",
    searching: "Đang tìm nhân vật phù hợp… {round} / 3",
    drew: "Đã chọn ngẫu nhiên một nhân vật.",
    drewFiltered: "Đã chọn từ {count} ứng viên ngẫu nhiên.",
    partial: "Chỉ chọn trong phần dữ liệu có thể truy cập qua API.",
    revisionMissing: "Phản hồi này không cho biết phiên bản dữ liệu.",
    addressUnavailable:
      "Không thể cập nhật thanh địa chỉ. Hãy sao chép “Liên kết đến nhân vật này”.",
    restoring: "Đang tải nhân vật được ghi trong URL…",
    restoredVerified:
      "Đã xác nhận vị trí dòng, phiên bản và UUID được ghi trong URL.",
    restored: "Đã tải dòng được chỉ định.",
    replayEnriched: "Đã thêm phiên bản và UUID vào liên kết của nhân vật này.",
    replayUnverified: "Không thể xác minh phiên bản hoặc UUID từ phản hồi này.",
    copied: "Đã sao chép văn bản đang hiển thị.",
    promptCopied: "Đã sao chép lời nhắc.",
    urlCopied: "Đã sao chép liên kết đến nhân vật này.",
    saving: "Đang lưu đầu ra hiện tại vào tệp.",
    conditionsChanged:
      "Đã đổi điều kiện chọn. Thay đổi sẽ áp dụng cho lần chọn tiếp theo.",
    dataLanguageChanged:
      "Đã đổi ngôn ngữ dữ liệu. Thay đổi sẽ áp dụng cho lần chọn tiếp theo.",
    filtersReset: "Đã xóa bộ lọc cho lần chọn tiếp theo.",
    fields: {
      cultural_background: "Văn hóa và quá trình lớn lên",
      skills_and_expertise: "Kỹ năng và chuyên môn",
      hobbies_and_interests: "Sở thích và mối quan tâm",
      career_goals_and_ambitions: "Mục tiêu và hoài bão",
      linguistic_background: "Nền tảng ngôn ngữ",
      linguistic_persona: "Hồ sơ ngôn ngữ",
      family_persona: "Hồ sơ gia đình",
      age: "Tuổi",
      sex: "Giới tính",
      occupation: "Nghề nghiệp",
      country: "Quốc gia",
      education_level: "Trình độ học vấn",
      education_degree: "Bằng cấp",
      bachelors_field: "Ngành học",
      marital_status: "Tình trạng hôn nhân",
      prefecture: "Đô, đạo, phủ, tỉnh",
      city: "Thành phố",
      state: "Bang",
      region: "Vùng",
      area: "Khu vực",
      district: "Quận / huyện",
      province: "Tỉnh",
      zone: "Khu vực cư trú",
      municipality: "Đô thị",
      commune: "Công xã",
      departement: "Đơn vị hành chính cấp tỉnh",
      department: "Đơn vị hành chính cấp tỉnh",
      planning_area: "Khu quy hoạch",
      zipcode: "Mã bưu chính",
      industry: "Ngành nghề",
      first_language: "Ngôn ngữ thứ nhất",
      second_language: "Ngôn ngữ thứ hai",
      third_language: "Ngôn ngữ thứ ba",
      languages_spoken: "Các ngôn ngữ sử dụng",
      household_type: "Loại hộ gia đình",
      family_type: "Loại gia đình",
      housing_type: "Nhà ở",
      military_status: "Tình trạng nghĩa vụ quân sự",
    },
    siteTitle: "Cuộc gặp tình cờ",
  },
  th: {
    uiLanguage: "ภาษาของหน้าจอ",
    synthetic: "ข้อมูลบุคคลสมมติ",
    controls: "เงื่อนไขการเลือก",
    dataset: "ประเทศ / ชุดข้อมูล",
    dataLanguage: "ภาษาของข้อมูล",
    allCountries: "ทุกประเทศ",
    defaultLanguages: "ภาษาเริ่มต้นของแต่ละประเทศ",
    allHint:
      "แต่ละประเทศมีโอกาสถูกเลือกเท่ากัน โดยอินเดียและเบลเยียมใช้ฉบับภาษาอังกฤษ",
    filters: "ตัวกรอง",
    optional: "ไม่บังคับ",
    sex: "เพศ",
    any: "ทั้งหมด",
    female: "หญิง",
    male: "ชาย",
    age: "อายุ",
    minAge: "ไม่จำกัดอายุขั้นต่ำ",
    maxAge: "ไม่จำกัดอายุสูงสุด",
    minAgeLabel: "อายุขั้นต่ำ",
    maxAgeLabel: "อายุสูงสุด",
    filterHint:
      "ตรวจสอบบุคคลที่สุ่มได้สูงสุด 300 คน หากไม่พบคนที่ตรงเงื่อนไข ให้ลองอีกครั้ง",
    resetFilters: "ล้างตัวกรอง",
    draw: "สุ่มเลือกบุคคล",
    loading: "กำลังโหลด…",
    cancel: "ยกเลิก",
    usage: "ตัวอย่างการใช้งาน",
    usageIntro:
      "นำภูมิหลังไปใส่ในคำสั่งเพื่อให้เอเจนต์ AI เป็นคู่ฝึกสนทนาภาษาอังกฤษหรือภาษาของบุคคลนั้น ตัวอย่างจะใส่ภูมิหลังของบุคคลที่แสดงอยู่ให้โดยอัตโนมัติ",
    englishExample: "คำสั่งสำหรับฝึกสนทนาภาษาอังกฤษ",
    localExample: "คำสั่งสำหรับฝึก {language}",
    promptCopy: "คัดลอกคำสั่ง",
    promptWaiting: "เลือกบุคคลเพื่อดูคำสั่งที่มีภูมิหลังของบุคคลนั้น",
    background: "ภูมิหลัง",
    persona: "บุคคล",
    unknownName: "ไม่ทราบชื่อ",
    backgroundText: "ข้อความภูมิหลัง",
    allFields: "ทุกฟิลด์",
    outputFormat: "รูปแบบผลลัพธ์",
    copy: "คัดลอก",
    save: "บันทึก",
    replayUrl: "ลิงก์ไปยังบุคคลนี้",
    outputPlaceholder: "โหลดข้อมูลบุคคลจาก Hugging Face",
    outputLabel: "ภูมิหลังสำหรับคัดลอก",
    chars: "{count} อักขระ",
    datasetUsed: "ชุดข้อมูลที่ใช้",
    sourceWaiting: "ชุดข้อมูลจะแสดงหลังจากโหลดเสร็จ",
    rows: "{count} แถว",
    unverified: "ไม่พบข้อมูล",
    checkLicense: "ตรวจสอบสัญญาอนุญาตของชุดข้อมูล",
    manualCopy: "คัดลอกด้วยตนเอง",
    manualCopyHint:
      "เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ โปรดคัดลอกข้อความที่เลือกด้วยตนเอง",
    selectAll: "เลือกทั้งหมด",
    close: "ปิด",
    noScript: "เปิดใช้งาน JavaScript เพื่อใช้เครื่องมือนี้",
    basicInfo: "ข้อมูลพื้นฐาน",
    personaLabel: "ประวัติบุคคล",
    rawDataNote: "ภูมิหลังของบุคคลแสดงเป็นภาษาต้นฉบับของข้อมูล",
    promptTemplate:
      "ฉันกำลังเรียน {language} โปรดสวมบทบาทเป็นบุคคลที่มีภูมิหลังด้านล่างและฝึกสนทนาเป็น {language} กับฉัน เริ่มด้วยการแนะนำตัวสั้น ๆ ถามทีละคำถาม แล้วรอคำตอบจากฉัน หากฉันใช้สำนวนที่ไม่เป็นธรรมชาติ ให้ช่วยปรับคำพูดสั้น ๆ ก่อนสนทนาต่อ\n\nภูมิหลังของบุคคล:\n{background}",
    original: "ภาษาต้นฉบับ",
    personaLanguage: "ภาษาที่ระบุในภูมิหลัง",
    uiChanged: "เปลี่ยนภาษาของหน้าจอแล้ว",
    fetching: "กำลังดึงข้อมูลจาก Hugging Face…",
    previousResult: "ยังคงแสดงผลลัพธ์ก่อนหน้า",
    cancelled: "ยกเลิกการโหลดแล้ว",
    fetchFailed: "โหลดไม่สำเร็จ",
    searching: "กำลังค้นหาบุคคลที่ตรงเงื่อนไข… {round} / 3",
    drew: "สุ่มเลือกบุคคลหนึ่งคนแล้ว",
    drewFiltered: "เลือกจากบุคคลที่สุ่มได้ {count} คน",
    partial: "การเลือกจำกัดเฉพาะข้อมูลที่เข้าถึงได้ผ่าน API",
    revisionMissing: "คำตอบนี้ไม่ได้ระบุรุ่นของข้อมูล",
    addressUnavailable:
      "อัปเดตแถบที่อยู่ไม่ได้ โปรดคัดลอก “ลิงก์ไปยังบุคคลนี้”",
    restoring: "กำลังโหลดบุคคลที่บันทึกไว้ใน URL…",
    restoredVerified: "ยืนยันตำแหน่งแถว รุ่น และ UUID ที่บันทึกไว้ใน URL แล้ว",
    restored: "โหลดแถวที่ระบุแล้ว",
    replayEnriched: "เพิ่มรุ่นและ UUID ลงในลิงก์ของบุคคลนี้แล้ว",
    replayUnverified: "คำตอบนี้ไม่สามารถใช้ตรวจสอบรุ่นหรือ UUID ได้",
    copied: "คัดลอกข้อความที่แสดงแล้ว",
    promptCopied: "คัดลอกคำสั่งแล้ว",
    urlCopied: "คัดลอกลิงก์ไปยังบุคคลนี้แล้ว",
    saving: "กำลังบันทึกผลลัพธ์ปัจจุบันลงในไฟล์",
    conditionsChanged:
      "เปลี่ยนเงื่อนไขการเลือกแล้ว โดยจะใช้ในการสุ่มครั้งถัดไป",
    dataLanguageChanged: "เปลี่ยนภาษาของข้อมูลแล้ว โดยจะใช้ในการสุ่มครั้งถัดไป",
    filtersReset: "ล้างตัวกรองสำหรับการสุ่มครั้งถัดไปแล้ว",
    fields: {
      cultural_background: "วัฒนธรรมและการเลี้ยงดู",
      skills_and_expertise: "ทักษะและความเชี่ยวชาญ",
      hobbies_and_interests: "งานอดิเรกและความสนใจ",
      career_goals_and_ambitions: "เป้าหมายและความใฝ่ฝัน",
      linguistic_background: "ภูมิหลังด้านภาษา",
      linguistic_persona: "ประวัติด้านภาษา",
      family_persona: "ประวัติครอบครัว",
      age: "อายุ",
      sex: "เพศ",
      occupation: "อาชีพ",
      country: "ประเทศ",
      education_level: "ระดับการศึกษา",
      education_degree: "วุฒิการศึกษา",
      bachelors_field: "สาขาวิชา",
      marital_status: "สถานภาพสมรส",
      prefecture: "จังหวัดญี่ปุ่น",
      city: "เมือง",
      state: "รัฐ",
      region: "ภูมิภาค",
      area: "พื้นที่",
      district: "เขต / อำเภอ",
      province: "จังหวัด",
      zone: "เขตที่อยู่อาศัย",
      municipality: "เทศบาล",
      commune: "คอมมูน",
      departement: "เขตการปกครอง",
      department: "เขตการปกครอง",
      planning_area: "พื้นที่วางแผน",
      zipcode: "รหัสไปรษณีย์",
      industry: "อุตสาหกรรม",
      first_language: "ภาษาที่หนึ่ง",
      second_language: "ภาษาที่สอง",
      third_language: "ภาษาที่สาม",
      languages_spoken: "ภาษาที่พูด",
      household_type: "ประเภทครัวเรือน",
      family_type: "ประเภทครอบครัว",
      housing_type: "ที่อยู่อาศัย",
      military_status: "สถานะการรับราชการทหาร",
    },
    siteTitle: "พบกันโดยบังเอิญ",
  },
  fil: {
    uiLanguage: "Wika ng interface",
    synthetic: "Datos ng mga kathang-isip na persona",
    controls: "Pagpili",
    dataset: "Bansa / dataset",
    dataLanguage: "Wika ng datos",
    allCountries: "Lahat ng bansa",
    defaultLanguages: "Paunang wika para sa bawat bansa",
    allHint:
      "Pantay ang tsansa ng bawat bansa na mapili. Bersiyong Ingles ang ginagamit para sa India at Belgium.",
    filters: "Mga salaan",
    optional: "Opsiyonal",
    sex: "Kasarian",
    any: "Anuman",
    female: "Babae",
    male: "Lalaki",
    age: "Edad",
    minAge: "Walang pinakamababa",
    maxAge: "Walang pinakamataas",
    minAgeLabel: "Pinakamababang edad",
    maxAgeLabel: "Pinakamataas na edad",
    filterHint:
      "Sinusuri ang hanggang 300 sapalarang kandidato. Subukan muli kung walang tumugma.",
    resetFilters: "Alisin ang mga salaan",
    draw: "Pumili ng sapalarang persona",
    loading: "Naglo-load…",
    cancel: "Kanselahin",
    usage: "Mga halimbawa ng paggamit",
    usageIntro:
      "Isama ang pinagmulan sa panuto upang gawing kausap ang isang ahenteng AI sa Ingles o sa wika ng persona. Awtomatikong kasama sa mga halimbawa ang pinagmulan ng personang ipinapakita.",
    englishExample: "Panuto para sa pag-uusap sa Ingles",
    localExample: "Panuto para sa pagsasanay sa {language}",
    promptCopy: "Kopyahin ang panuto",
    promptWaiting:
      "Pumili ng persona upang makita ang panutong kasama ang kaniyang pinagmulan.",
    background: "Pinagmulan",
    persona: "Persona",
    unknownName: "Hindi makuha ang pangalan",
    backgroundText: "Teksto ng pinagmulan",
    allFields: "Lahat ng detalye",
    outputFormat: "Anyo ng resulta",
    copy: "Kopyahin",
    save: "I-save",
    replayUrl: "Link sa personang ito",
    outputPlaceholder: "Kumuha ng persona mula sa Hugging Face.",
    outputLabel: "Pinagmulan na kokopyahin",
    chars: "{count} karakter",
    datasetUsed: "Dataset na ginamit",
    sourceWaiting: "Lilitaw ang dataset matapos makuha ang datos.",
    rows: "{count} hilera",
    unverified: "Hindi makuha",
    checkLicense: "Tingnan ang lisensiya ng dataset",
    manualCopy: "Manu-manong kopyahin",
    manualCopyHint:
      "Hindi pinayagan ng browser ang awtomatikong pagkopya. Manu-manong kopyahin ang napiling teksto.",
    selectAll: "Piliin lahat",
    close: "Isara",
    noScript: "Paganahin ang JavaScript upang magamit ang kasangkapang ito.",
    basicInfo: "Pangunahing impormasyon",
    personaLabel: "Paglalarawan ng tao",
    rawDataNote:
      "Ipinapakita ang pinagmulan ng persona sa orihinal na wika ng datos.",
    promptTemplate:
      "Nag-aaral ako ng {language}. Gumanap bilang taong may pinagmulan sa ibaba at makipagsanayan sa akin sa pag-uusap sa {language}. Magsimula sa maikling pagpapakilala, magtanong nang paisa-isa, at hintayin ang sagot ko. Kung may hindi natural na pananalita sa sagot ko, magbigay ng maikling pagwawasto bago ipagpatuloy ang usapan.\n\nPinagmulan ng persona:\n{background}",
    original: "Orihinal na wika",
    personaLanguage: "Wikang nakasaad sa pinagmulan",
    uiChanged: "Nabago ang wika ng interface.",
    fetching: "Kinukuha mula sa Hugging Face…",
    previousResult: "Ipinapakita pa rin ang naunang resulta.",
    cancelled: "Kinansela ang pagkuha ng datos.",
    fetchFailed: "Hindi nakuha ang datos.",
    searching: "Naghahanap ng tumutugmang persona… {round} / 3",
    drew: "Nakapili ng isang sapalarang persona.",
    drewFiltered: "Pinili mula sa {count} sapalarang kandidato.",
    partial: "Limitado ang pagpili sa datos na makukuha sa pamamagitan ng API.",
    revisionMissing: "Hindi tinutukoy ng tugon na ito ang rebisyon ng datos.",
    addressUnavailable:
      "Hindi ma-update ang address bar. Kopyahin ang “Link sa personang ito”.",
    restoring: "Kinukuha ang personang nakatala sa URL…",
    restoredVerified:
      "Napatunayan ang posisyon ng hilera, rebisyon, at UUID na nakatala sa URL.",
    restored: "Nakuha ang itinakdang hilera.",
    replayEnriched: "Idinagdag ang rebisyon at UUID sa link ng personang ito.",
    replayUnverified:
      "Hindi mapapatunayan ang rebisyon o UUID gamit ang tugon na ito.",
    copied: "Nakopya ang ipinapakitang teksto.",
    promptCopied: "Nakopya ang panuto.",
    urlCopied: "Nakopya ang link sa personang ito.",
    saving: "Sine-save ang kasalukuyang resulta sa isang file.",
    conditionsChanged:
      "Nabago ang mga kondisyon sa pagpili. Gagamitin ang mga ito sa susunod na pagpili.",
    dataLanguageChanged:
      "Nabago ang wika ng datos. Gagamitin ito sa susunod na pagpili.",
    filtersReset: "Naalis ang mga salaan para sa susunod na pagpili.",
    fields: {
      cultural_background: "Kultura at pagpapalaki",
      skills_and_expertise: "Mga kasanayan at kadalubhasaan",
      hobbies_and_interests: "Mga libangan at interes",
      career_goals_and_ambitions: "Mga layunin at ambisyon",
      linguistic_background: "Pinagmulan sa wika",
      linguistic_persona: "Paglalarawan ng paggamit ng wika",
      family_persona: "Paglalarawan ng pamilya",
      age: "Edad",
      sex: "Kasarian",
      occupation: "Hanapbuhay",
      country: "Bansa",
      education_level: "Antas ng edukasyon",
      education_degree: "Digri",
      bachelors_field: "Larangan ng pag-aaral",
      marital_status: "Katayuang sibil",
      prefecture: "Prepektura",
      city: "Lungsod",
      state: "Estado",
      region: "Rehiyon",
      area: "Lugar",
      district: "Distrito",
      province: "Lalawigan",
      zone: "Sona ng tirahan",
      municipality: "Munisipalidad",
      commune: "Komuna",
      departement: "Departamentong administratibo",
      department: "Departamentong administratibo",
      planning_area: "Lugar ng pagpaplano",
      zipcode: "Kodigo postal",
      industry: "Industriya",
      first_language: "Unang wika",
      second_language: "Ikalawang wika",
      third_language: "Ikatlong wika",
      languages_spoken: "Mga wikang sinasalita",
      household_type: "Uri ng sambahayan",
      family_type: "Uri ng pamilya",
      housing_type: "Tirahan",
      military_status: "Katayuan sa serbisyo militar",
    },
    siteTitle: "Di-inaasahang pagtatagpo",
  },
  es: {
    uiLanguage: "Idioma de la interfaz",
    synthetic: "Perfiles sintéticos",
    controls: "Selección",
    dataset: "País / conjunto de datos",
    dataLanguage: "Idioma de los datos",
    allCountries: "Todos los países",
    defaultLanguages: "Idioma predeterminado de cada país",
    allHint:
      "Todos los países tienen la misma probabilidad de ser elegidos. India y Bélgica usan las versiones en inglés.",
    filters: "Filtros",
    optional: "Opcional",
    sex: "Sexo",
    any: "Cualquiera",
    female: "Mujer",
    male: "Hombre",
    age: "Edad",
    minAge: "Sin mínimo",
    maxAge: "Sin máximo",
    minAgeLabel: "Edad mínima",
    maxAgeLabel: "Edad máxima",
    filterHint:
      "Se revisan hasta 300 perfiles aleatorios. Si no hay coincidencias, vuelve a intentarlo.",
    resetFilters: "Borrar filtros",
    draw: "Elegir al azar",
    loading: "Cargando…",
    cancel: "Cancelar",
    usage: "Ejemplos de uso",
    usageIntro:
      "Incluye el contexto del personaje en un prompt para practicar conversación con un agente de IA en inglés o en el idioma del personaje. Los ejemplos incorporan automáticamente el contexto del perfil mostrado.",
    englishExample: "Prompt para practicar inglés",
    localExample: "Prompt para practicar {language}",
    promptCopy: "Copiar prompt",
    promptWaiting: "Carga un perfil para ver un prompt con su contexto.",
    background: "Contexto del personaje",
    persona: "Personaje",
    unknownName: "Nombre desconocido",
    backgroundText: "Texto de contexto",
    allFields: "Todos los campos",
    outputFormat: "Formato de salida",
    copy: "Copiar",
    save: "Guardar",
    replayUrl: "Enlace a este perfil",
    outputPlaceholder: "Carga un perfil de Hugging Face.",
    outputLabel: "Contexto para copiar",
    chars: "{count} caracteres",
    datasetUsed: "Conjunto de datos utilizado",
    sourceWaiting: "El conjunto de datos se mostrará después de la carga.",
    rows: "{count} filas",
    unverified: "No disponible",
    checkLicense: "Consultar la licencia del conjunto de datos",
    manualCopy: "Copiar manualmente",
    manualCopyHint:
      "El navegador no ha permitido la copia automática. Copia el texto seleccionado manualmente.",
    selectAll: "Seleccionar todo",
    close: "Cerrar",
    noScript: "Activa JavaScript para usar esta herramienta.",
    basicInfo: "Información básica",
    personaLabel: "Perfil",
    rawDataNote:
      "El contexto del personaje se muestra en el idioma original de los datos.",
    promptTemplate:
      "Estoy aprendiendo {language}. Interpreta a la persona con el contexto que aparece a continuación y practica conversación conmigo en {language}. Empieza con una presentación breve, haz una sola pregunta a la vez y espera mi respuesta. Si uso una expresión poco natural, reformúlala brevemente antes de continuar la conversación.\n\nContexto del personaje:\n{background}",
    original: "Idioma original",
    personaLanguage: "Idioma indicado en el contexto",
    uiChanged: "Idioma de la interfaz cambiado.",
    fetching: "Obteniendo datos de Hugging Face…",
    previousResult: "Se sigue mostrando el resultado anterior.",
    cancelled: "Carga cancelada.",
    fetchFailed: "Error de carga.",
    searching: "Buscando un perfil que coincida… {round} / 3",
    drew: "Se ha elegido un perfil al azar.",
    drewFiltered: "Se ha elegido entre {count} perfiles aleatorios.",
    partial:
      "La selección se limita a los datos disponibles a través de la API.",
    revisionMissing:
      "Esta respuesta no permite confirmar la versión de los datos.",
    addressUnavailable:
      "No se pudo actualizar la barra de direcciones. Copia «Enlace a este perfil».",
    restoring: "Cargando el perfil guardado en la URL…",
    restoredVerified:
      "Se ha confirmado que la posición, la versión y el UUID coinciden con la URL.",
    restored: "Se ha cargado la fila indicada.",
    replayEnriched:
      "Se han añadido la versión y el UUID al enlace de este perfil.",
    replayUnverified:
      "Esta respuesta no permite confirmar la versión o el UUID.",
    copied: "Se ha copiado el texto mostrado.",
    promptCopied: "Se ha copiado el prompt.",
    urlCopied: "Se ha copiado el enlace a este perfil.",
    saving: "Guardando el contenido actual en un archivo.",
    conditionsChanged:
      "Condiciones de selección cambiadas. Se aplicarán en la próxima selección.",
    dataLanguageChanged:
      "Idioma de los datos cambiado. Se aplicará en la próxima selección.",
    filtersReset: "Se han borrado los filtros para la próxima selección.",
    fields: {
      cultural_background: "Cultura y crianza",
      skills_and_expertise: "Habilidades y conocimientos",
      hobbies_and_interests: "Aficiones e intereses",
      career_goals_and_ambitions: "Metas y aspiraciones",
      linguistic_background: "Contexto lingüístico",
      linguistic_persona: "Perfil lingüístico",
      family_persona: "Perfil familiar",
      age: "Edad",
      sex: "Sexo",
      occupation: "Ocupación",
      country: "País",
      education_level: "Nivel educativo",
      education_degree: "Titulación",
      bachelors_field: "Área de estudios",
      marital_status: "Estado civil",
      prefecture: "Prefectura",
      city: "Ciudad",
      state: "Estado",
      region: "Región",
      area: "Área",
      district: "Distrito",
      province: "Provincia",
      zone: "Zona residencial",
      municipality: "Municipio",
      commune: "Comuna",
      departement: "Departamento",
      department: "Departamento",
      planning_area: "Área de planificación",
      zipcode: "Código postal",
      industry: "Sector",
      first_language: "Primera lengua",
      second_language: "Segunda lengua",
      third_language: "Tercera lengua",
      languages_spoken: "Idiomas hablados",
      household_type: "Tipo de hogar",
      family_type: "Composición familiar",
      housing_type: "Vivienda",
      military_status: "Situación militar",
    },
    siteTitle: "Encuentros inesperados",
  },
  fr: {
    uiLanguage: "Langue de l’interface",
    synthetic: "Profils synthétiques",
    controls: "Sélection",
    dataset: "Pays / jeu de données",
    dataLanguage: "Langue des données",
    allCountries: "Tous les pays",
    defaultLanguages: "Langue par défaut de chaque pays",
    allHint:
      "Chaque pays a la même probabilité d’être sélectionné. Les versions anglaises sont utilisées pour l’Inde et la Belgique.",
    filters: "Filtres",
    optional: "Facultatif",
    sex: "Sexe",
    any: "Sans préférence",
    female: "Femme",
    male: "Homme",
    age: "Âge",
    minAge: "Sans minimum",
    maxAge: "Sans maximum",
    minAgeLabel: "Âge minimum",
    maxAgeLabel: "Âge maximum",
    filterHint:
      "Jusqu’à 300 profils aléatoires sont examinés. Relancez la sélection si aucun profil ne correspond.",
    resetFilters: "Effacer les filtres",
    draw: "Choisir au hasard",
    loading: "Chargement…",
    cancel: "Annuler",
    usage: "Exemples d’utilisation",
    usageIntro:
      "Utilisez le profil dans un prompt pour pratiquer la conversation avec un agent IA en anglais ou dans la langue du personnage. Les exemples incluent automatiquement le contexte du profil affiché.",
    englishExample: "Prompt pour pratiquer l’anglais",
    localExample: "Prompt de conversation — {language}",
    promptCopy: "Copier le prompt",
    promptWaiting:
      "Chargez un profil pour afficher un prompt contenant son contexte.",
    background: "Contexte du personnage",
    persona: "Personnage",
    unknownName: "Nom inconnu",
    backgroundText: "Texte du contexte",
    allFields: "Tous les champs",
    outputFormat: "Format de sortie",
    copy: "Copier",
    save: "Enregistrer",
    replayUrl: "Lien vers ce profil",
    outputPlaceholder: "Chargez un profil depuis Hugging Face.",
    outputLabel: "Contexte à copier",
    chars: "{count} caractères",
    datasetUsed: "Jeu de données utilisé",
    sourceWaiting: "Le jeu de données s’affichera après le chargement.",
    rows: "{count} lignes",
    unverified: "Non disponible",
    checkLicense: "Consulter la licence du jeu de données",
    manualCopy: "Copier manuellement",
    manualCopyHint:
      "Le navigateur n’a pas autorisé la copie automatique. Copiez manuellement le texte sélectionné.",
    selectAll: "Tout sélectionner",
    close: "Fermer",
    noScript: "Activez JavaScript pour utiliser cet outil.",
    basicInfo: "Informations générales",
    personaLabel: "Profil",
    rawDataNote:
      "Le contexte du personnage est affiché dans la langue d’origine des données.",
    promptTemplate:
      "J’apprends la langue suivante : {language}. Jouez le rôle de la personne décrite ci-dessous et conversez avec moi dans cette langue ({language}). Commencez par une brève présentation, posez une seule question à la fois et attendez ma réponse. Si j’utilise une expression peu naturelle, reformulez-la brièvement avant de poursuivre la conversation.\n\nContexte du personnage :\n{background}",
    original: "Langue d’origine",
    personaLanguage: "Langue indiquée dans le contexte",
    uiChanged: "Langue de l’interface modifiée.",
    fetching: "Récupération depuis Hugging Face…",
    previousResult: "Le résultat précédent est toujours affiché.",
    cancelled: "Chargement annulé.",
    fetchFailed: "Échec du chargement.",
    searching: "Recherche d’un profil correspondant… {round} / 3",
    drew: "Un profil a été choisi au hasard.",
    drewFiltered: "Sélection parmi {count} profils aléatoires.",
    partial: "La sélection se limite aux données disponibles via l’API.",
    revisionMissing:
      "Cette réponse ne permet pas de confirmer la version des données.",
    addressUnavailable:
      "Impossible de mettre à jour la barre d’adresse. Copiez « Lien vers ce profil ».",
    restoring: "Chargement du profil enregistré dans l’URL…",
    restoredVerified:
      "La position, la version et l’UUID correspondent aux valeurs enregistrées dans l’URL.",
    restored: "La ligne demandée a été chargée.",
    replayEnriched:
      "La version et l’UUID ont été ajoutés au lien vers ce profil.",
    replayUnverified:
      "Cette réponse ne permet pas de confirmer la version ou l’UUID.",
    copied: "Le texte affiché a été copié.",
    promptCopied: "Le prompt a été copié.",
    urlCopied: "Le lien vers ce profil a été copié.",
    saving: "Enregistrement du contenu actuel dans un fichier.",
    conditionsChanged:
      "Conditions de sélection modifiées. Elles s’appliqueront à la prochaine sélection.",
    dataLanguageChanged:
      "Langue des données modifiée. Elle s’appliquera à la prochaine sélection.",
    filtersReset: "Les filtres de la prochaine sélection ont été effacés.",
    fields: {
      cultural_background: "Culture et enfance",
      skills_and_expertise: "Compétences et expertise",
      hobbies_and_interests: "Loisirs et centres d’intérêt",
      career_goals_and_ambitions: "Objectifs et ambitions",
      linguistic_background: "Contexte linguistique",
      linguistic_persona: "Profil linguistique",
      family_persona: "Profil familial",
      age: "Âge",
      sex: "Sexe",
      occupation: "Profession",
      country: "Pays",
      education_level: "Niveau d’études",
      education_degree: "Diplôme",
      bachelors_field: "Domaine d’études",
      marital_status: "Situation matrimoniale",
      prefecture: "Préfecture",
      city: "Ville",
      state: "État",
      region: "Région",
      area: "Zone",
      district: "District",
      province: "Province",
      zone: "Zone résidentielle",
      municipality: "Municipalité",
      commune: "Commune",
      departement: "Département",
      department: "Département",
      planning_area: "Zone de planification",
      zipcode: "Code postal",
      industry: "Secteur d’activité",
      first_language: "Première langue",
      second_language: "Deuxième langue",
      third_language: "Troisième langue",
      languages_spoken: "Langues parlées",
      household_type: "Type de ménage",
      family_type: "Composition familiale",
      housing_type: "Logement",
      military_status: "Situation militaire",
    },
    siteTitle: "Rencontres fortuites",
  },
  pt: {
    uiLanguage: "Idioma da interface",
    synthetic: "Perfis sintéticos",
    controls: "Seleção",
    dataset: "País / conjunto de dados",
    dataLanguage: "Idioma dos dados",
    allCountries: "Todos os países",
    defaultLanguages: "Idioma padrão de cada país",
    allHint:
      "Todos os países têm a mesma chance de seleção. Índia e Bélgica usam as versões em inglês.",
    filters: "Filtros",
    optional: "Opcional",
    sex: "Sexo",
    any: "Qualquer",
    female: "Feminino",
    male: "Masculino",
    age: "Idade",
    minAge: "Sem mínimo",
    maxAge: "Sem máximo",
    minAgeLabel: "Idade mínima",
    maxAgeLabel: "Idade máxima",
    filterHint:
      "São verificados até 300 perfis aleatórios. Se nenhum corresponder, tente novamente.",
    resetFilters: "Limpar filtros",
    draw: "Selecionar ao acaso",
    loading: "Carregando…",
    cancel: "Cancelar",
    usage: "Exemplos de uso",
    usageIntro:
      "Use o contexto em uma instrução para praticar conversação com um agente de IA em inglês ou no idioma da pessoa. Os exemplos incluem automaticamente o contexto do perfil exibido.",
    englishExample: "Instrução para praticar inglês",
    localExample: "Instrução para praticar {language}",
    promptCopy: "Copiar instrução",
    promptWaiting:
      "Carregue um perfil para ver uma instrução com seu contexto.",
    background: "Contexto",
    persona: "Personagem",
    unknownName: "Nome desconhecido",
    backgroundText: "Texto de contexto",
    allFields: "Todos os campos",
    outputFormat: "Formato de saída",
    copy: "Copiar",
    save: "Salvar",
    replayUrl: "Link para este perfil",
    outputPlaceholder: "Carregue um perfil do Hugging Face.",
    outputLabel: "Contexto para copiar",
    chars: "{count} caracteres",
    datasetUsed: "Conjunto de dados utilizado",
    sourceWaiting: "O conjunto de dados será exibido após o carregamento.",
    rows: "{count} linhas",
    unverified: "Não disponível",
    checkLicense: "Verificar a licença do conjunto de dados",
    manualCopy: "Copiar manualmente",
    manualCopyHint:
      "O navegador não permitiu a cópia automática. Copie o texto selecionado manualmente.",
    selectAll: "Selecionar tudo",
    close: "Fechar",
    noScript: "Ative o JavaScript para usar esta ferramenta.",
    basicInfo: "Informações básicas",
    personaLabel: "Perfil",
    rawDataNote: "O contexto da pessoa é exibido no idioma original dos dados.",
    promptTemplate:
      "Estou aprendendo {language}. Assuma o papel da pessoa com o contexto abaixo e converse comigo em {language}. Comece com uma breve apresentação, faça apenas uma pergunta de cada vez e espere minha resposta. Se eu usar uma expressão pouco natural, reformule-a brevemente antes de continuar a conversa.\n\nContexto da pessoa:\n{background}",
    original: "Idioma original",
    personaLanguage: "Idioma indicado no contexto",
    uiChanged: "Idioma da interface alterado.",
    fetching: "Obtendo dados do Hugging Face…",
    previousResult: "O resultado anterior continua sendo exibido.",
    cancelled: "Carregamento cancelado.",
    fetchFailed: "Falha no carregamento.",
    searching: "Buscando um perfil correspondente… {round} / 3",
    drew: "Um perfil foi selecionado ao acaso.",
    drewFiltered: "Selecionado entre {count} perfis aleatórios.",
    partial: "A seleção se limita aos dados disponíveis pela API.",
    revisionMissing: "Esta resposta não identifica a versão dos dados.",
    addressUnavailable:
      "Não foi possível atualizar a barra de endereços. Copie “Link para este perfil”.",
    restoring: "Carregando o perfil registrado na URL…",
    restoredVerified:
      "Posição da linha, versão e UUID confirmados com os valores da URL.",
    restored: "A linha indicada foi carregada.",
    replayEnriched: "A versão e o UUID foram adicionados ao link deste perfil.",
    replayUnverified: "Esta resposta não permite verificar a versão ou o UUID.",
    copied: "Texto exibido copiado.",
    promptCopied: "Instrução copiada.",
    urlCopied: "Link deste perfil copiado.",
    saving: "Salvando o conteúdo atual em um arquivo.",
    conditionsChanged:
      "Condições de seleção alteradas. Serão aplicadas na próxima seleção.",
    dataLanguageChanged:
      "Idioma dos dados alterado. Será aplicado na próxima seleção.",
    filtersReset: "Filtros da próxima seleção limpos.",
    fields: {
      cultural_background: "Cultura e criação",
      skills_and_expertise: "Habilidades e conhecimentos",
      hobbies_and_interests: "Passatempos e interesses",
      career_goals_and_ambitions: "Metas e ambições",
      linguistic_background: "Contexto linguístico",
      linguistic_persona: "Perfil linguístico",
      family_persona: "Perfil familiar",
      age: "Idade",
      sex: "Sexo",
      occupation: "Ocupação",
      country: "País",
      education_level: "Escolaridade",
      education_degree: "Titulação",
      bachelors_field: "Área de formação",
      marital_status: "Estado civil",
      prefecture: "Prefeitura japonesa",
      city: "Cidade",
      state: "Estado",
      region: "Região",
      area: "Área",
      district: "Distrito",
      province: "Província",
      zone: "Zona residencial",
      municipality: "Município",
      commune: "Comuna",
      departement: "Departamento",
      department: "Departamento",
      planning_area: "Área de planejamento",
      zipcode: "Código postal",
      industry: "Setor",
      first_language: "Primeira língua",
      second_language: "Segunda língua",
      third_language: "Terceira língua",
      languages_spoken: "Idiomas falados",
      household_type: "Composição do domicílio",
      family_type: "Composição familiar",
      housing_type: "Moradia",
      military_status: "Situação militar",
    },
    siteTitle: "Encontros ao acaso",
  },
  de: {
    uiLanguage: "Sprache der Oberfläche",
    synthetic: "Synthetische Personenprofile",
    controls: "Auswahl",
    dataset: "Land / Datensatz",
    dataLanguage: "Sprache der Daten",
    allCountries: "Alle Länder",
    defaultLanguages: "Standardsprache des jeweiligen Landes",
    allHint:
      "Jedes Land wird mit gleicher Wahrscheinlichkeit ausgewählt. Für Indien und Belgien werden die englischen Versionen verwendet.",
    filters: "Filter",
    optional: "Optional",
    sex: "Geschlecht",
    any: "Beliebig",
    female: "Weiblich",
    male: "Männlich",
    age: "Alter",
    minAge: "Keine Untergrenze",
    maxAge: "Keine Obergrenze",
    minAgeLabel: "Mindestalter",
    maxAgeLabel: "Höchstalter",
    filterHint:
      "Es werden bis zu 300 zufällige Profile geprüft. Falls kein Profil passt, wiederholen Sie die Auswahl.",
    resetFilters: "Filter zurücksetzen",
    draw: "Zufälliges Profil auswählen",
    loading: "Wird geladen…",
    cancel: "Abbrechen",
    usage: "Anwendungsbeispiele",
    usageIntro:
      "Verwenden Sie den Hintergrund in einer Anweisung, um mit einem KI-Agenten Englisch oder die Sprache der Person zu üben. Die Beispiele enthalten automatisch den Hintergrund des angezeigten Profils.",
    englishExample: "Anweisung für englische Gespräche",
    localExample: "Übungsanweisung: {language}",
    promptCopy: "Anweisung kopieren",
    promptWaiting:
      "Laden Sie ein Profil, um eine Anweisung mit dessen Hintergrund anzuzeigen.",
    background: "Hintergrund",
    persona: "Personenprofil",
    unknownName: "Name unbekannt",
    backgroundText: "Hintergrundtext",
    allFields: "Alle Felder",
    outputFormat: "Ausgabeformat",
    copy: "Kopieren",
    save: "Speichern",
    replayUrl: "Link zu diesem Profil",
    outputPlaceholder: "Ein Profil von Hugging Face laden.",
    outputLabel: "Hintergrund zum Kopieren",
    chars: "{count} Zeichen",
    datasetUsed: "Verwendeter Datensatz",
    sourceWaiting: "Der Datensatz wird nach dem Laden angezeigt.",
    rows: "{count} Zeilen",
    unverified: "Nicht verfügbar",
    checkLicense: "Lizenz des Datensatzes prüfen",
    manualCopy: "Manuell kopieren",
    manualCopyHint:
      "Der Browser hat das automatische Kopieren nicht erlaubt. Kopieren Sie den ausgewählten Text manuell.",
    selectAll: "Alles auswählen",
    close: "Schließen",
    noScript: "Aktivieren Sie JavaScript, um dieses Werkzeug zu verwenden.",
    basicInfo: "Grunddaten",
    personaLabel: "Profil",
    rawDataNote:
      "Der Hintergrund der Person wird in der Originalsprache der Daten angezeigt.",
    promptTemplate:
      "Ich lerne {language}. Übernimm die Rolle der Person mit dem folgenden Hintergrund und übe mit mir ein Gespräch auf {language}. Beginne mit einer kurzen Vorstellung, stelle jeweils nur eine Frage und warte auf meine Antwort. Wenn ich eine unnatürliche Formulierung verwende, formuliere sie kurz um und setze das Gespräch fort.\n\nHintergrund der Person:\n{background}",
    original: "Originalsprache",
    personaLanguage: "Im Hintergrund angegebene Sprache",
    uiChanged: "Sprache der Oberfläche geändert.",
    fetching: "Daten von Hugging Face werden abgerufen…",
    previousResult: "Das vorherige Ergebnis wird weiterhin angezeigt.",
    cancelled: "Laden abgebrochen.",
    fetchFailed: "Laden fehlgeschlagen.",
    searching: "Passendes Profil wird gesucht… {round} / 3",
    drew: "Ein zufälliges Profil wurde ausgewählt.",
    drewFiltered: "Aus {count} zufälligen Profilen ausgewählt.",
    partial:
      "Die Auswahl ist auf die über die API verfügbaren Daten beschränkt.",
    revisionMissing: "Diese Antwort enthält keine Angabe zur Datenversion.",
    addressUnavailable:
      "Die Adressleiste konnte nicht aktualisiert werden. Kopieren Sie „Link zu diesem Profil“.",
    restoring: "Das in der URL gespeicherte Profil wird geladen…",
    restoredVerified:
      "Zeilenposition, Version und UUID stimmen mit der URL überein.",
    restored: "Die angegebene Zeile wurde geladen.",
    replayEnriched: "Version und UUID wurden dem Profillink hinzugefügt.",
    replayUnverified:
      "Version oder UUID lassen sich anhand dieser Antwort nicht prüfen.",
    copied: "Angezeigten Text kopiert.",
    promptCopied: "Anweisung kopiert.",
    urlCopied: "Profillink kopiert.",
    saving: "Die aktuelle Ausgabe wird in einer Datei gespeichert.",
    conditionsChanged:
      "Auswahlbedingungen geändert. Sie gelten für die nächste Auswahl.",
    dataLanguageChanged:
      "Sprache der Daten geändert. Sie gilt für die nächste Auswahl.",
    filtersReset: "Filter für die nächste Auswahl zurückgesetzt.",
    fields: {
      cultural_background: "Kultur und Herkunft",
      skills_and_expertise: "Fähigkeiten und Fachwissen",
      hobbies_and_interests: "Hobbys und Interessen",
      career_goals_and_ambitions: "Ziele und Ambitionen",
      linguistic_background: "Sprachlicher Hintergrund",
      linguistic_persona: "Sprachprofil",
      family_persona: "Familienprofil",
      age: "Alter",
      sex: "Geschlecht",
      occupation: "Beruf",
      country: "Land",
      education_level: "Bildungsstand",
      education_degree: "Abschluss",
      bachelors_field: "Studienfach",
      marital_status: "Familienstand",
      prefecture: "Präfektur",
      city: "Stadt",
      state: "Bundesstaat",
      region: "Region",
      area: "Gebiet",
      district: "Bezirk",
      province: "Provinz",
      zone: "Wohngebiet",
      municipality: "Gemeinde",
      commune: "Kommune",
      departement: "Département",
      department: "Département",
      planning_area: "Planungsgebiet",
      zipcode: "Postleitzahl",
      industry: "Branche",
      first_language: "Erstsprache",
      second_language: "Zweitsprache",
      third_language: "Drittsprache",
      languages_spoken: "Gesprochene Sprachen",
      household_type: "Haushaltstyp",
      family_type: "Familienstruktur",
      housing_type: "Wohnform",
      military_status: "Wehrdienststatus",
    },
    siteTitle: "Zufällige Begegnungen",
  },
  it: {
    uiLanguage: "Lingua dell’interfaccia",
    synthetic: "Profili sintetici",
    controls: "Selezione",
    dataset: "Paese / insieme di dati",
    dataLanguage: "Lingua dei dati",
    allCountries: "Tutti i paesi",
    defaultLanguages: "Lingua predefinita di ogni paese",
    allHint:
      "Ogni paese ha la stessa probabilità di essere selezionato. Per India e Belgio vengono usate le versioni in inglese.",
    filters: "Filtri",
    optional: "Facoltativo",
    sex: "Sesso",
    any: "Qualsiasi",
    female: "Femmina",
    male: "Maschio",
    age: "Età",
    minAge: "Nessun minimo",
    maxAge: "Nessun massimo",
    minAgeLabel: "Età minima",
    maxAgeLabel: "Età massima",
    filterHint:
      "Vengono controllati fino a 300 profili casuali. Se nessuno corrisponde, riprova.",
    resetFilters: "Cancella filtri",
    draw: "Scegli un profilo casuale",
    loading: "Caricamento…",
    cancel: "Annulla",
    usage: "Esempi d’uso",
    usageIntro:
      "Usa il contesto in un’istruzione per esercitarti con un agente IA a conversare in inglese o nella lingua della persona. Gli esempi includono automaticamente il contesto del profilo visualizzato.",
    englishExample: "Istruzione per esercitarsi in inglese",
    localExample: "Istruzione per esercitarsi: {language}",
    promptCopy: "Copia istruzione",
    promptWaiting:
      "Carica un profilo per vedere un’istruzione con il suo contesto.",
    background: "Contesto",
    persona: "Personaggio",
    unknownName: "Nome sconosciuto",
    backgroundText: "Testo del contesto",
    allFields: "Tutti i campi",
    outputFormat: "Formato di uscita",
    copy: "Copia",
    save: "Salva",
    replayUrl: "Link a questo profilo",
    outputPlaceholder: "Carica un profilo da Hugging Face.",
    outputLabel: "Contesto da copiare",
    chars: "{count} caratteri",
    datasetUsed: "Insieme di dati utilizzato",
    sourceWaiting: "L’insieme di dati verrà mostrato dopo il caricamento.",
    rows: "{count} righe",
    unverified: "Non disponibile",
    checkLicense: "Controlla la licenza dei dati",
    manualCopy: "Copia manualmente",
    manualCopyHint:
      "Il browser non ha consentito la copia automatica. Copia manualmente il testo selezionato.",
    selectAll: "Seleziona tutto",
    close: "Chiudi",
    noScript: "Abilita JavaScript per usare questo strumento.",
    basicInfo: "Informazioni di base",
    personaLabel: "Profilo",
    rawDataNote:
      "Il contesto della persona viene mostrato nella lingua originale dei dati.",
    promptTemplate:
      "Sto imparando questa lingua: {language}. Interpreta la persona con il contesto riportato sotto e conversa con me in {language}. Inizia con una breve presentazione, fai una sola domanda alla volta e attendi la mia risposta. Se uso un’espressione poco naturale, riformulala brevemente prima di proseguire la conversazione.\n\nContesto della persona:\n{background}",
    original: "Lingua originale",
    personaLanguage: "Lingua indicata nel contesto",
    uiChanged: "Lingua dell’interfaccia modificata.",
    fetching: "Recupero dei dati da Hugging Face…",
    previousResult: "È ancora visualizzato il risultato precedente.",
    cancelled: "Caricamento annullato.",
    fetchFailed: "Caricamento non riuscito.",
    searching: "Ricerca di un profilo corrispondente… {round} / 3",
    drew: "È stato scelto un profilo casuale.",
    drewFiltered: "Scelto tra {count} profili casuali.",
    partial: "La selezione è limitata ai dati disponibili tramite l’API.",
    revisionMissing: "Questa risposta non indica la versione dei dati.",
    addressUnavailable:
      "Impossibile aggiornare la barra degli indirizzi. Copia “Link a questo profilo”.",
    restoring: "Caricamento del profilo registrato nell’URL…",
    restoredVerified:
      "Posizione della riga, versione e UUID corrispondono ai valori nell’URL.",
    restored: "La riga indicata è stata caricata.",
    replayEnriched:
      "La versione e l’UUID sono stati aggiunti al link del profilo.",
    replayUnverified:
      "Questa risposta non permette di verificare la versione o l’UUID.",
    copied: "Testo visualizzato copiato.",
    promptCopied: "Istruzione copiata.",
    urlCopied: "Link al profilo copiato.",
    saving: "Salvataggio del contenuto attuale in un file.",
    conditionsChanged:
      "Condizioni di selezione modificate. Si applicheranno alla prossima estrazione.",
    dataLanguageChanged:
      "Lingua dei dati modificata. Si applicherà alla prossima estrazione.",
    filtersReset: "Filtri per la prossima estrazione cancellati.",
    fields: {
      cultural_background: "Cultura e formazione personale",
      skills_and_expertise: "Competenze e conoscenze",
      hobbies_and_interests: "Hobby e interessi",
      career_goals_and_ambitions: "Obiettivi e ambizioni",
      linguistic_background: "Contesto linguistico",
      linguistic_persona: "Profilo linguistico",
      family_persona: "Profilo familiare",
      age: "Età",
      sex: "Sesso",
      occupation: "Professione",
      country: "Paese",
      education_level: "Livello di istruzione",
      education_degree: "Titolo di studio",
      bachelors_field: "Campo di studi",
      marital_status: "Stato civile",
      prefecture: "Prefettura",
      city: "Città",
      state: "Stato",
      region: "Regione",
      area: "Zona",
      district: "Distretto",
      province: "Provincia",
      zone: "Zona residenziale",
      municipality: "Comune",
      commune: "Comune",
      departement: "Dipartimento",
      department: "Dipartimento",
      planning_area: "Area di pianificazione",
      zipcode: "Codice postale",
      industry: "Settore",
      first_language: "Prima lingua",
      second_language: "Seconda lingua",
      third_language: "Terza lingua",
      languages_spoken: "Lingue parlate",
      household_type: "Tipo di nucleo domestico",
      family_type: "Composizione familiare",
      housing_type: "Abitazione",
      military_status: "Situazione militare",
    },
    siteTitle: "Incontri inattesi",
  },
  nl: {
    uiLanguage: "Interfacetaal",
    synthetic: "Synthetische persoonsprofielen",
    controls: "Selectie",
    dataset: "Land / gegevensverzameling",
    dataLanguage: "Taal van de gegevens",
    allCountries: "Alle landen",
    defaultLanguages: "Standaardtaal per land",
    allHint:
      "Elk land heeft dezelfde kans om te worden gekozen. Voor India en België worden de Engelse versies gebruikt.",
    filters: "Filters",
    optional: "Optioneel",
    sex: "Geslacht",
    any: "Geen voorkeur",
    female: "Vrouw",
    male: "Man",
    age: "Leeftijd",
    minAge: "Geen minimum",
    maxAge: "Geen maximum",
    minAgeLabel: "Minimumleeftijd",
    maxAgeLabel: "Maximumleeftijd",
    filterHint:
      "Er worden maximaal 300 willekeurige profielen bekeken. Probeer opnieuw als er geen passend profiel is.",
    resetFilters: "Filters wissen",
    draw: "Willekeurig profiel kiezen",
    loading: "Laden…",
    cancel: "Annuleren",
    usage: "Gebruiksvoorbeelden",
    usageIntro:
      "Gebruik de achtergrond in een instructie om met een AI-agent Engels of de taal van de persoon te oefenen. De voorbeelden bevatten automatisch de achtergrond van het getoonde profiel.",
    englishExample: "Instructie voor Engelse gesprekken",
    localExample: "Oefeninstructie: {language}",
    promptCopy: "Instructie kopiëren",
    promptWaiting:
      "Laad een profiel om een instructie met de bijbehorende achtergrond te zien.",
    background: "Achtergrond",
    persona: "Personage",
    unknownName: "Naam onbekend",
    backgroundText: "Achtergrondtekst",
    allFields: "Alle velden",
    outputFormat: "Uitvoerformaat",
    copy: "Kopiëren",
    save: "Opslaan",
    replayUrl: "Link naar dit profiel",
    outputPlaceholder: "Laad een profiel van Hugging Face.",
    outputLabel: "Achtergrond om te kopiëren",
    chars: "{count} tekens",
    datasetUsed: "Gebruikte gegevensverzameling",
    sourceWaiting: "De gegevensverzameling wordt na het laden getoond.",
    rows: "{count} rijen",
    unverified: "Niet beschikbaar",
    checkLicense: "Licentie van de gegevens bekijken",
    manualCopy: "Handmatig kopiëren",
    manualCopyHint:
      "De browser stond automatisch kopiëren niet toe. Kopieer de geselecteerde tekst handmatig.",
    selectAll: "Alles selecteren",
    close: "Sluiten",
    noScript: "Schakel JavaScript in om dit hulpmiddel te gebruiken.",
    basicInfo: "Basisgegevens",
    personaLabel: "Profiel",
    rawDataNote:
      "De achtergrond van de persoon wordt in de oorspronkelijke taal van de gegevens getoond.",
    promptTemplate:
      "Ik leer {language}. Speel de persoon met de onderstaande achtergrond en oefen met mij een gesprek in het {language}. Begin met een korte kennismaking, stel één vraag tegelijk en wacht op mijn antwoord. Als ik een onnatuurlijke formulering gebruik, geef dan kort een natuurlijkere versie en ga verder met het gesprek.\n\nAchtergrond van de persoon:\n{background}",
    original: "Oorspronkelijke taal",
    personaLanguage: "Taal vermeld in de achtergrond",
    uiChanged: "Interfacetaal gewijzigd.",
    fetching: "Gegevens ophalen van Hugging Face…",
    previousResult: "Het vorige resultaat wordt nog steeds getoond.",
    cancelled: "Laden geannuleerd.",
    fetchFailed: "Laden mislukt.",
    searching: "Passend profiel zoeken… {round} / 3",
    drew: "Een willekeurig profiel is gekozen.",
    drewFiltered: "Gekozen uit {count} willekeurige profielen.",
    partial:
      "De selectie is beperkt tot de gegevens die via de API beschikbaar zijn.",
    revisionMissing: "Deze reactie vermeldt geen gegevensversie.",
    addressUnavailable:
      "De adresbalk kon niet worden bijgewerkt. Kopieer ‘Link naar dit profiel’.",
    restoring: "Het profiel uit de URL laden…",
    restoredVerified: "Rijpositie, versie en UUID komen overeen met de URL.",
    restored: "De opgegeven rij is geladen.",
    replayEnriched: "Versie en UUID zijn aan de profiellink toegevoegd.",
    replayUnverified:
      "De versie of UUID kan met deze reactie niet worden gecontroleerd.",
    copied: "Getoonde tekst gekopieerd.",
    promptCopied: "Instructie gekopieerd.",
    urlCopied: "Profiellink gekopieerd.",
    saving: "De huidige uitvoer wordt in een bestand opgeslagen.",
    conditionsChanged:
      "Selectievoorwaarden gewijzigd. Ze gelden voor de volgende selectie.",
    dataLanguageChanged:
      "Taal van de gegevens gewijzigd. Deze geldt voor de volgende selectie.",
    filtersReset: "Filters voor de volgende selectie gewist.",
    fields: {
      cultural_background: "Cultuur en opvoeding",
      skills_and_expertise: "Vaardigheden en deskundigheid",
      hobbies_and_interests: "Hobby’s en interesses",
      career_goals_and_ambitions: "Doelen en ambities",
      linguistic_background: "Taalachtergrond",
      linguistic_persona: "Taalprofiel",
      family_persona: "Gezinsprofiel",
      age: "Leeftijd",
      sex: "Geslacht",
      occupation: "Beroep",
      country: "Land",
      education_level: "Opleidingsniveau",
      education_degree: "Diploma",
      bachelors_field: "Studierichting",
      marital_status: "Burgerlijke staat",
      prefecture: "Prefectuur",
      city: "Stad",
      state: "Deelstaat",
      region: "Regio",
      area: "Gebied",
      district: "District",
      province: "Provincie",
      zone: "Woongebied",
      municipality: "Gemeente",
      commune: "Gemeente",
      departement: "Departement",
      department: "Departement",
      planning_area: "Plangebied",
      zipcode: "Postcode",
      industry: "Sector",
      first_language: "Eerste taal",
      second_language: "Tweede taal",
      third_language: "Derde taal",
      languages_spoken: "Gesproken talen",
      household_type: "Huishoudtype",
      family_type: "Gezinssamenstelling",
      housing_type: "Woningtype",
      military_status: "Dienstplichtstatus",
    },
    siteTitle: "Toevallige ontmoetingen",
  },
  ru: {
    uiLanguage: "Язык интерфейса",
    synthetic: "Синтетические профили людей",
    controls: "Условия выбора",
    dataset: "Страна / набор данных",
    dataLanguage: "Язык данных",
    allCountries: "Все страны",
    defaultLanguages: "Язык по умолчанию для каждой страны",
    allHint:
      "Все страны выбираются с одинаковой вероятностью. Для Индии и Бельгии используются английские версии.",
    filters: "Фильтры",
    optional: "Необязательно",
    sex: "Пол",
    any: "Любой",
    female: "Женский",
    male: "Мужской",
    age: "Возраст",
    minAge: "Без нижней границы",
    maxAge: "Без верхней границы",
    minAgeLabel: "Минимальный возраст",
    maxAgeLabel: "Максимальный возраст",
    filterHint:
      "Проверяется до 300 случайных профилей. Если подходящий не найден, повторите выбор.",
    resetFilters: "Сбросить фильтры",
    draw: "Выбрать случайный профиль",
    loading: "Загрузка…",
    cancel: "Отменить",
    usage: "Примеры использования",
    usageIntro:
      "Добавьте биографию в запрос, чтобы практиковать с ИИ-агентом английский или язык персонажа. Примеры автоматически включают биографию отображаемого персонажа.",
    englishExample: "Запрос для практики английского",
    localExample: "Запрос для языковой практики: {language}",
    promptCopy: "Копировать запрос",
    promptWaiting:
      "Загрузите профиль, чтобы увидеть запрос с биографией персонажа.",
    background: "Биография",
    persona: "Персонаж",
    unknownName: "Имя неизвестно",
    backgroundText: "Текст биографии",
    allFields: "Все поля",
    outputFormat: "Формат вывода",
    copy: "Копировать",
    save: "Сохранить",
    replayUrl: "Ссылка на этот профиль",
    outputPlaceholder: "Загрузите профиль из Hugging Face.",
    outputLabel: "Биография для копирования",
    chars: "Символов: {count}",
    datasetUsed: "Используемый набор данных",
    sourceWaiting: "Набор данных будет показан после загрузки.",
    rows: "Строк: {count}",
    unverified: "Недоступно",
    checkLicense: "Проверить лицензию набора данных",
    manualCopy: "Копировать вручную",
    manualCopyHint:
      "Браузер не разрешил автоматическое копирование. Скопируйте выделенный текст вручную.",
    selectAll: "Выделить всё",
    close: "Закрыть",
    noScript: "Для работы с этим инструментом включите JavaScript.",
    basicInfo: "Основные сведения",
    personaLabel: "Описание персонажа",
    rawDataNote: "Биография персонажа отображается на исходном языке данных.",
    promptTemplate:
      "Я изучаю следующий язык: {language}. Играйте роль человека с приведённой ниже биографией и общайтесь со мной на этом языке ({language}). Начните с краткого представления, задавайте по одному вопросу и ждите моего ответа. Если я использую неестественное выражение, кратко переформулируйте его и продолжите разговор.\n\nБиография персонажа:\n{background}",
    original: "Исходный язык",
    personaLanguage: "Язык, указанный в биографии",
    uiChanged: "Язык интерфейса изменён.",
    fetching: "Получение данных из Hugging Face…",
    previousResult: "По-прежнему отображается предыдущий результат.",
    cancelled: "Загрузка отменена.",
    fetchFailed: "Не удалось загрузить данные.",
    searching: "Поиск подходящего профиля… {round} / 3",
    drew: "Выбран случайный профиль.",
    drewFiltered: "Выбор из случайных кандидатов: {count}.",
    partial: "Выбор ограничен данными, доступными через API.",
    revisionMissing: "Этот ответ не позволяет определить версию данных.",
    addressUnavailable:
      "Не удалось обновить адресную строку. Скопируйте «Ссылка на этот профиль».",
    restoring: "Загрузка профиля, записанного в URL…",
    restoredVerified:
      "Позиция строки, версия и UUID совпадают с записанными в URL.",
    restored: "Указанная строка загружена.",
    replayEnriched: "Версия и UUID добавлены в ссылку на профиль.",
    replayUnverified: "Этот ответ не позволяет проверить версию или UUID.",
    copied: "Отображаемый текст скопирован.",
    promptCopied: "Запрос скопирован.",
    urlCopied: "Ссылка на профиль скопирована.",
    saving: "Текущий результат сохраняется в файл.",
    conditionsChanged:
      "Условия выбора изменены. Они применятся при следующем выборе.",
    dataLanguageChanged:
      "Язык данных изменён. Он применится при следующем выборе.",
    filtersReset: "Фильтры для следующего выбора сброшены.",
    fields: {
      cultural_background: "Культура и воспитание",
      skills_and_expertise: "Навыки и знания",
      hobbies_and_interests: "Увлечения и интересы",
      career_goals_and_ambitions: "Цели и стремления",
      linguistic_background: "Языковая биография",
      linguistic_persona: "Языковой профиль",
      family_persona: "Семейная биография",
      age: "Возраст",
      sex: "Пол",
      occupation: "Профессия",
      country: "Страна",
      education_level: "Уровень образования",
      education_degree: "Степень",
      bachelors_field: "Специальность",
      marital_status: "Семейное положение",
      prefecture: "Префектура",
      city: "Город",
      state: "Штат",
      region: "Регион",
      area: "Территория",
      district: "Район",
      province: "Провинция",
      zone: "Жилая зона",
      municipality: "Муниципалитет",
      commune: "Коммуна",
      departement: "Департамент",
      department: "Департамент",
      planning_area: "Планировочная зона",
      zipcode: "Почтовый индекс",
      industry: "Отрасль",
      first_language: "Первый язык",
      second_language: "Второй язык",
      third_language: "Третий язык",
      languages_spoken: "Используемые языки",
      household_type: "Состав домохозяйства",
      family_type: "Состав семьи",
      housing_type: "Жильё",
      military_status: "Статус военной службы",
    },
    siteTitle: "Случайные встречи",
  },
  uk: {
    uiLanguage: "Мова інтерфейсу",
    synthetic: "Синтетичні профілі людей",
    controls: "Умови вибору",
    dataset: "Країна / набір даних",
    dataLanguage: "Мова даних",
    allCountries: "Усі країни",
    defaultLanguages: "Типова мова для кожної країни",
    allHint:
      "Усі країни обираються з однаковою ймовірністю. Для Індії та Бельгії використовуються англійські версії.",
    filters: "Фільтри",
    optional: "Необов’язково",
    sex: "Стать",
    any: "Будь-яка",
    female: "Жіноча",
    male: "Чоловіча",
    age: "Вік",
    minAge: "Без нижньої межі",
    maxAge: "Без верхньої межі",
    minAgeLabel: "Мінімальний вік",
    maxAgeLabel: "Максимальний вік",
    filterHint:
      "Перевіряється до 300 випадкових профілів. Якщо відповідного немає, повторіть вибір.",
    resetFilters: "Очистити фільтри",
    draw: "Обрати випадковий профіль",
    loading: "Завантаження…",
    cancel: "Скасувати",
    usage: "Приклади використання",
    usageIntro:
      "Додайте біографію до запиту, щоб практикувати з ШІ-агентом англійську або мову персонажа. Приклади автоматично містять біографію показаного персонажа.",
    englishExample: "Запит для практики англійської",
    localExample: "Запит для мовної практики: {language}",
    promptCopy: "Копіювати запит",
    promptWaiting:
      "Завантажте профіль, щоб побачити запит із біографією персонажа.",
    background: "Біографія",
    persona: "Персонаж",
    unknownName: "Ім’я невідоме",
    backgroundText: "Текст біографії",
    allFields: "Усі поля",
    outputFormat: "Формат виводу",
    copy: "Копіювати",
    save: "Зберегти",
    replayUrl: "Посилання на цей профіль",
    outputPlaceholder: "Завантажте профіль із Hugging Face.",
    outputLabel: "Біографія для копіювання",
    chars: "Символів: {count}",
    datasetUsed: "Використаний набір даних",
    sourceWaiting: "Набір даних буде показано після завантаження.",
    rows: "Рядків: {count}",
    unverified: "Недоступно",
    checkLicense: "Перевірити ліцензію набору даних",
    manualCopy: "Копіювати вручну",
    manualCopyHint:
      "Браузер не дозволив автоматичне копіювання. Скопіюйте виділений текст вручну.",
    selectAll: "Виділити все",
    close: "Закрити",
    noScript: "Увімкніть JavaScript, щоб користуватися цим інструментом.",
    basicInfo: "Основні відомості",
    personaLabel: "Опис персонажа",
    rawDataNote: "Біографія персонажа відображається мовою оригінальних даних.",
    promptTemplate:
      "Я вивчаю таку мову: {language}. Виконуйте роль людини з наведеною нижче біографією та спілкуйтеся зі мною цією мовою ({language}). Почніть із короткого представлення, ставте по одному запитанню та чекайте моєї відповіді. Якщо я використовую неприродний вислів, коротко перефразуйте його, а потім продовжте розмову.\n\nБіографія персонажа:\n{background}",
    original: "Мова оригіналу",
    personaLanguage: "Мова, зазначена в біографії",
    uiChanged: "Мову інтерфейсу змінено.",
    fetching: "Отримання даних із Hugging Face…",
    previousResult: "Досі відображається попередній результат.",
    cancelled: "Завантаження скасовано.",
    fetchFailed: "Не вдалося завантажити дані.",
    searching: "Пошук відповідного профілю… {round} / 3",
    drew: "Обрано випадковий профіль.",
    drewFiltered: "Профіль обрано з випадкових кандидатів ({count}).",
    partial: "Вибір обмежено даними, доступними через API.",
    revisionMissing: "Ця відповідь не дає змоги визначити версію даних.",
    addressUnavailable:
      "Не вдалося оновити адресний рядок. Скопіюйте «Посилання на цей профіль».",
    restoring: "Завантаження профілю, записаного в URL…",
    restoredVerified:
      "Позиція рядка, версія та UUID збігаються із записаними в URL.",
    restored: "Зазначений рядок завантажено.",
    replayEnriched: "Версію та UUID додано до посилання на профіль.",
    replayUnverified: "Ця відповідь не дає змоги перевірити версію або UUID.",
    copied: "Показаний текст скопійовано.",
    promptCopied: "Запит скопійовано.",
    urlCopied: "Посилання на профіль скопійовано.",
    saving: "Поточний результат зберігається у файл.",
    conditionsChanged:
      "Умови вибору змінено. Вони діятимуть під час наступного вибору.",
    dataLanguageChanged:
      "Мову даних змінено. Вона діятиме під час наступного вибору.",
    filtersReset: "Фільтри для наступного вибору очищено.",
    fields: {
      cultural_background: "Культура та виховання",
      skills_and_expertise: "Навички та знання",
      hobbies_and_interests: "Захоплення та інтереси",
      career_goals_and_ambitions: "Цілі та прагнення",
      linguistic_background: "Мовна біографія",
      linguistic_persona: "Мовний профіль",
      family_persona: "Сімейна біографія",
      age: "Вік",
      sex: "Стать",
      occupation: "Професія",
      country: "Країна",
      education_level: "Рівень освіти",
      education_degree: "Академічний ступінь",
      bachelors_field: "Спеціальність",
      marital_status: "Сімейний стан",
      prefecture: "Префектура",
      city: "Місто",
      state: "Штат",
      region: "Регіон",
      area: "Територія",
      district: "Район",
      province: "Провінція",
      zone: "Житлова зона",
      municipality: "Муніципалітет",
      commune: "Комуна",
      departement: "Департамент",
      department: "Департамент",
      planning_area: "Планувальна зона",
      zipcode: "Поштовий індекс",
      industry: "Галузь",
      first_language: "Перша мова",
      second_language: "Друга мова",
      third_language: "Третя мова",
      languages_spoken: "Використовувані мови",
      household_type: "Склад домогосподарства",
      family_type: "Склад сім’ї",
      housing_type: "Житло",
      military_status: "Статус військової служби",
    },
    siteTitle: "Випадкові зустрічі",
  },
  pl: {
    uiLanguage: "Język interfejsu",
    synthetic: "Syntetyczne profile osób",
    controls: "Warunki losowania",
    dataset: "Kraj / zbiór danych",
    dataLanguage: "Język danych",
    allCountries: "Wszystkie kraje",
    defaultLanguages: "Domyślny język każdego kraju",
    allHint:
      "Każdy kraj ma taką samą szansę wyboru. Dla Indii i Belgii używane są wersje angielskie.",
    filters: "Filtry",
    optional: "Opcjonalne",
    sex: "Płeć",
    any: "Dowolna",
    female: "Kobieta",
    male: "Mężczyzna",
    age: "Wiek",
    minAge: "Bez dolnej granicy",
    maxAge: "Bez górnej granicy",
    minAgeLabel: "Minimalny wiek",
    maxAgeLabel: "Maksymalny wiek",
    filterHint:
      "Sprawdzanych jest do 300 losowych profili. Jeśli żaden nie pasuje, powtórz losowanie.",
    resetFilters: "Wyczyść filtry",
    draw: "Wylosuj profil",
    loading: "Ładowanie…",
    cancel: "Anuluj",
    usage: "Przykłady zastosowań",
    usageIntro:
      "Użyj biografii w poleceniu, aby ćwiczyć z agentem AI rozmowę po angielsku lub w języku postaci. Przykłady automatycznie zawierają biografię wyświetlanej postaci.",
    englishExample: "Polecenie do ćwiczenia angielskiego",
    localExample: "Polecenie do nauki języka: {language}",
    promptCopy: "Kopiuj polecenie",
    promptWaiting:
      "Wczytaj profil, aby zobaczyć polecenie z biografią postaci.",
    background: "Biografia",
    persona: "Postać",
    unknownName: "Imię nieznane",
    backgroundText: "Tekst biografii",
    allFields: "Wszystkie pola",
    outputFormat: "Format wyjściowy",
    copy: "Kopiuj",
    save: "Zapisz",
    replayUrl: "Link do tego profilu",
    outputPlaceholder: "Wczytaj profil z Hugging Face.",
    outputLabel: "Biografia do skopiowania",
    chars: "Liczba znaków: {count}",
    datasetUsed: "Używany zbiór danych",
    sourceWaiting: "Zbiór danych pojawi się po wczytaniu.",
    rows: "Liczba wierszy: {count}",
    unverified: "Niedostępne",
    checkLicense: "Sprawdź licencję zbioru danych",
    manualCopy: "Kopiuj ręcznie",
    manualCopyHint:
      "Przeglądarka nie zezwoliła na automatyczne kopiowanie. Skopiuj zaznaczony tekst ręcznie.",
    selectAll: "Zaznacz wszystko",
    close: "Zamknij",
    noScript: "Włącz JavaScript, aby korzystać z tego narzędzia.",
    basicInfo: "Podstawowe informacje",
    personaLabel: "Opis postaci",
    rawDataNote:
      "Biografia postaci jest wyświetlana w oryginalnym języku danych.",
    promptTemplate:
      "Uczę się następującego języka: {language}. Wciel się w osobę o poniższej biografii i rozmawiaj ze mną w tym języku ({language}). Zacznij od krótkiego przedstawienia się, zadawaj po jednym pytaniu i czekaj na moją odpowiedź. Jeśli użyję nienaturalnego sformułowania, krótko je popraw, a następnie kontynuuj rozmowę.\n\nBiografia postaci:\n{background}",
    original: "Język oryginału",
    personaLanguage: "Język podany w biografii",
    uiChanged: "Zmieniono język interfejsu.",
    fetching: "Pobieranie danych z Hugging Face…",
    previousResult: "Nadal wyświetlany jest poprzedni wynik.",
    cancelled: "Anulowano ładowanie.",
    fetchFailed: "Nie udało się wczytać danych.",
    searching: "Szukanie pasującego profilu… {round} / 3",
    drew: "Wylosowano jeden profil.",
    drewFiltered: "Profil wybrano z losowych kandydatów ({count}).",
    partial: "Wybór jest ograniczony do danych dostępnych przez API.",
    revisionMissing: "Ta odpowiedź nie określa wersji danych.",
    addressUnavailable:
      "Nie udało się zaktualizować paska adresu. Skopiuj „Link do tego profilu”.",
    restoring: "Wczytywanie profilu zapisanego w adresie URL…",
    restoredVerified: "Pozycja wiersza, wersja i UUID są zgodne z adresem URL.",
    restored: "Wczytano wskazany wiersz.",
    replayEnriched: "Dodano wersję i UUID do linku profilu.",
    replayUnverified: "Ta odpowiedź nie pozwala zweryfikować wersji lub UUID.",
    copied: "Skopiowano wyświetlany tekst.",
    promptCopied: "Skopiowano polecenie.",
    urlCopied: "Skopiowano link do profilu.",
    saving: "Zapisywanie bieżącego wyniku do pliku.",
    conditionsChanged:
      "Zmieniono warunki losowania. Zostaną użyte przy następnym losowaniu.",
    dataLanguageChanged:
      "Zmieniono język danych. Zostanie użyty przy następnym losowaniu.",
    filtersReset: "Wyczyszczono filtry dla następnego losowania.",
    fields: {
      cultural_background: "Kultura i wychowanie",
      skills_and_expertise: "Umiejętności i wiedza",
      hobbies_and_interests: "Hobby i zainteresowania",
      career_goals_and_ambitions: "Cele i ambicje",
      linguistic_background: "Biografia językowa",
      linguistic_persona: "Profil językowy",
      family_persona: "Biografia rodzinna",
      age: "Wiek",
      sex: "Płeć",
      occupation: "Zawód",
      country: "Kraj",
      education_level: "Poziom wykształcenia",
      education_degree: "Tytuł / stopień",
      bachelors_field: "Kierunek studiów",
      marital_status: "Stan cywilny",
      prefecture: "Prefektura",
      city: "Miasto",
      state: "Stan",
      region: "Region",
      area: "Obszar",
      district: "Dzielnica",
      province: "Prowincja",
      zone: "Strefa zamieszkania",
      municipality: "Gmina",
      commune: "Gmina",
      departement: "Departament",
      department: "Departament",
      planning_area: "Obszar planistyczny",
      zipcode: "Kod pocztowy",
      industry: "Branża",
      first_language: "Pierwszy język",
      second_language: "Drugi język",
      third_language: "Trzeci język",
      languages_spoken: "Używane języki",
      household_type: "Skład gospodarstwa domowego",
      family_type: "Skład rodziny",
      housing_type: "Mieszkanie",
      military_status: "Status służby wojskowej",
    },
    siteTitle: "Przypadkowe spotkania",
  },
  cs: {
    uiLanguage: "Jazyk rozhraní",
    synthetic: "Syntetické profily osob",
    controls: "Podmínky výběru",
    dataset: "Země / datová sada",
    dataLanguage: "Jazyk dat",
    allCountries: "Všechny země",
    defaultLanguages: "Výchozí jazyk každé země",
    allHint:
      "Všechny země mají stejnou šanci na výběr. Pro Indii a Belgii se používají anglické verze.",
    filters: "Filtry",
    optional: "Volitelné",
    sex: "Pohlaví",
    any: "Libovolné",
    female: "Žena",
    male: "Muž",
    age: "Věk",
    minAge: "Bez dolní meze",
    maxAge: "Bez horní meze",
    minAgeLabel: "Minimální věk",
    maxAgeLabel: "Maximální věk",
    filterHint:
      "Prověří se až 300 náhodných profilů. Pokud žádný nevyhovuje, výběr zopakujte.",
    resetFilters: "Vymazat filtry",
    draw: "Vybrat náhodný profil",
    loading: "Načítání…",
    cancel: "Zrušit",
    usage: "Příklady použití",
    usageIntro:
      "Použijte životopis v zadání a procvičujte s AI agentem konverzaci v angličtině nebo v jazyce postavy. Příklady automaticky obsahují životopis zobrazené postavy.",
    englishExample: "Zadání pro procvičování angličtiny",
    localExample: "Zadání pro jazykové cvičení: {language}",
    promptCopy: "Kopírovat zadání",
    promptWaiting: "Načtěte profil a zobrazí se zadání s životopisem postavy.",
    background: "Životopis",
    persona: "Postava",
    unknownName: "Jméno neznámé",
    backgroundText: "Text životopisu",
    allFields: "Všechna pole",
    outputFormat: "Výstupní formát",
    copy: "Kopírovat",
    save: "Uložit",
    replayUrl: "Odkaz na tento profil",
    outputPlaceholder: "Načtěte profil z Hugging Face.",
    outputLabel: "Životopis ke zkopírování",
    chars: "Počet znaků: {count}",
    datasetUsed: "Použitá datová sada",
    sourceWaiting: "Datová sada se zobrazí po načtení.",
    rows: "Počet řádků: {count}",
    unverified: "Nedostupné",
    checkLicense: "Ověřit licenci datové sady",
    manualCopy: "Kopírovat ručně",
    manualCopyHint:
      "Prohlížeč nepovolil automatické kopírování. Zkopírujte vybraný text ručně.",
    selectAll: "Vybrat vše",
    close: "Zavřít",
    noScript: "Pro použití tohoto nástroje povolte JavaScript.",
    basicInfo: "Základní údaje",
    personaLabel: "Popis postavy",
    rawDataNote: "Životopis postavy se zobrazuje v původním jazyce dat.",
    promptTemplate:
      "Učím se tento jazyk: {language}. Vžij se do osoby s níže uvedeným životopisem a konverzuj se mnou v tomto jazyce ({language}). Začni krátkým představením, pokládej vždy jen jednu otázku a počkej na mou odpověď. Pokud použiji nepřirozenou formulaci, krátce ji přeformuluj a pak pokračuj v rozhovoru.\n\nŽivotopis postavy:\n{background}",
    original: "Původní jazyk",
    personaLanguage: "Jazyk uvedený v životopisu",
    uiChanged: "Jazyk rozhraní byl změněn.",
    fetching: "Načítání dat z Hugging Face…",
    previousResult: "Stále se zobrazuje předchozí výsledek.",
    cancelled: "Načítání bylo zrušeno.",
    fetchFailed: "Načítání se nezdařilo.",
    searching: "Hledání vyhovujícího profilu… {round} / 3",
    drew: "Byl vybrán náhodný profil.",
    drewFiltered: "Profil byl vybrán z náhodných kandidátů ({count}).",
    partial: "Výběr je omezen na data dostupná přes API.",
    revisionMissing: "Tato odpověď neuvádí verzi dat.",
    addressUnavailable:
      "Adresní řádek se nepodařilo aktualizovat. Zkopírujte „Odkaz na tento profil“.",
    restoring: "Načítání profilu zaznamenaného v URL…",
    restoredVerified: "Pozice řádku, verze a UUID odpovídají hodnotám v URL.",
    restored: "Zadaný řádek byl načten.",
    replayEnriched: "Verze a UUID byly přidány do odkazu na profil.",
    replayUnverified: "Tato odpověď neumožňuje ověřit verzi nebo UUID.",
    copied: "Zobrazený text byl zkopírován.",
    promptCopied: "Zadání bylo zkopírováno.",
    urlCopied: "Odkaz na profil byl zkopírován.",
    saving: "Aktuální výstup se ukládá do souboru.",
    conditionsChanged:
      "Podmínky výběru byly změněny. Použijí se při dalším výběru.",
    dataLanguageChanged: "Jazyk dat byl změněn. Použije se při dalším výběru.",
    filtersReset: "Filtry pro další výběr byly vymazány.",
    fields: {
      cultural_background: "Kultura a výchova",
      skills_and_expertise: "Dovednosti a znalosti",
      hobbies_and_interests: "Záliby a zájmy",
      career_goals_and_ambitions: "Cíle a ambice",
      linguistic_background: "Jazykové zázemí",
      linguistic_persona: "Jazykový profil",
      family_persona: "Rodinné zázemí",
      age: "Věk",
      sex: "Pohlaví",
      occupation: "Povolání",
      country: "Země",
      education_level: "Úroveň vzdělání",
      education_degree: "Titul",
      bachelors_field: "Studijní obor",
      marital_status: "Rodinný stav",
      prefecture: "Prefektura",
      city: "Město",
      state: "Spolkový stát",
      region: "Region",
      area: "Oblast",
      district: "Okres",
      province: "Provincie",
      zone: "Obytná zóna",
      municipality: "Obec",
      commune: "Komuna",
      departement: "Departement",
      department: "Departement",
      planning_area: "Plánovací oblast",
      zipcode: "PSČ",
      industry: "Odvětví",
      first_language: "První jazyk",
      second_language: "Druhý jazyk",
      third_language: "Třetí jazyk",
      languages_spoken: "Používané jazyky",
      household_type: "Složení domácnosti",
      family_type: "Složení rodiny",
      housing_type: "Bydlení",
      military_status: "Stav vojenské služby",
    },
    siteTitle: "Náhodná setkání",
  },
  sk: {
    uiLanguage: "Jazyk rozhrania",
    synthetic: "Syntetické profily osôb",
    controls: "Podmienky výberu",
    dataset: "Krajina / súbor údajov",
    dataLanguage: "Jazyk údajov",
    allCountries: "Všetky krajiny",
    defaultLanguages: "Predvolený jazyk každej krajiny",
    allHint:
      "Všetky krajiny majú rovnakú šancu na výber. Pre Indiu a Belgicko sa používajú anglické verzie.",
    filters: "Filtre",
    optional: "Voliteľné",
    sex: "Pohlavie",
    any: "Ľubovoľné",
    female: "Žena",
    male: "Muž",
    age: "Vek",
    minAge: "Bez dolnej hranice",
    maxAge: "Bez hornej hranice",
    minAgeLabel: "Minimálny vek",
    maxAgeLabel: "Maximálny vek",
    filterHint:
      "Preverí sa najviac 300 náhodných profilov. Ak žiadny nevyhovuje, zopakujte výber.",
    resetFilters: "Vymazať filtre",
    draw: "Vybrať náhodný profil",
    loading: "Načítava sa…",
    cancel: "Zrušiť",
    usage: "Príklady použitia",
    usageIntro:
      "Použite životopis v zadaní a precvičujte si s AI agentom konverzáciu v angličtine alebo v jazyku postavy. Príklady automaticky obsahujú životopis zobrazenej postavy.",
    englishExample: "Zadanie na precvičovanie angličtiny",
    localExample: "Zadanie na jazykové cvičenie: {language}",
    promptCopy: "Kopírovať zadanie",
    promptWaiting:
      "Načítajte profil a zobrazí sa zadanie so životopisom postavy.",
    background: "Životopis",
    persona: "Postava",
    unknownName: "Meno neznáme",
    backgroundText: "Text životopisu",
    allFields: "Všetky polia",
    outputFormat: "Výstupný formát",
    copy: "Kopírovať",
    save: "Uložiť",
    replayUrl: "Odkaz na tento profil",
    outputPlaceholder: "Načítajte profil z Hugging Face.",
    outputLabel: "Životopis na skopírovanie",
    chars: "Počet znakov: {count}",
    datasetUsed: "Použitý súbor údajov",
    sourceWaiting: "Súbor údajov sa zobrazí po načítaní.",
    rows: "Počet riadkov: {count}",
    unverified: "Nedostupné",
    checkLicense: "Overiť licenciu súboru údajov",
    manualCopy: "Kopírovať ručne",
    manualCopyHint:
      "Prehliadač nepovolil automatické kopírovanie. Skopírujte vybraný text ručne.",
    selectAll: "Vybrať všetko",
    close: "Zavrieť",
    noScript: "Na používanie tohto nástroja povoľte JavaScript.",
    basicInfo: "Základné údaje",
    personaLabel: "Opis postavy",
    rawDataNote: "Životopis postavy sa zobrazuje v pôvodnom jazyku údajov.",
    promptTemplate:
      "Učím sa tento jazyk: {language}. Vži sa do osoby s nižšie uvedeným životopisom a konverzuj so mnou v tomto jazyku ({language}). Začni krátkym predstavením, polož vždy len jednu otázku a počkaj na moju odpoveď. Ak použijem neprirodzenú formuláciu, krátko ju preformuluj a potom pokračuj v rozhovore.\n\nŽivotopis postavy:\n{background}",
    original: "Pôvodný jazyk",
    personaLanguage: "Jazyk uvedený v životopise",
    uiChanged: "Jazyk rozhrania bol zmenený.",
    fetching: "Získavanie údajov z Hugging Face…",
    previousResult: "Stále sa zobrazuje predchádzajúci výsledok.",
    cancelled: "Načítavanie bolo zrušené.",
    fetchFailed: "Načítanie zlyhalo.",
    searching: "Hľadanie vyhovujúceho profilu… {round} / 3",
    drew: "Bol vybraný náhodný profil.",
    drewFiltered: "Profil bol vybraný z náhodných kandidátov ({count}).",
    partial: "Výber je obmedzený na údaje dostupné cez API.",
    revisionMissing: "Táto odpoveď neuvádza verziu údajov.",
    addressUnavailable:
      "Panel s adresou sa nepodarilo aktualizovať. Skopírujte „Odkaz na tento profil“.",
    restoring: "Načítavanie profilu zaznamenaného v URL…",
    restoredVerified:
      "Pozícia riadka, verzia a UUID sa zhodujú s hodnotami v URL.",
    restored: "Zadaný riadok bol načítaný.",
    replayEnriched: "Verzia a UUID boli pridané do odkazu na profil.",
    replayUnverified: "Táto odpoveď neumožňuje overiť verziu alebo UUID.",
    copied: "Zobrazený text bol skopírovaný.",
    promptCopied: "Zadanie bolo skopírované.",
    urlCopied: "Odkaz na profil bol skopírovaný.",
    saving: "Aktuálny výstup sa ukladá do súboru.",
    conditionsChanged:
      "Podmienky výberu boli zmenené. Použijú sa pri ďalšom výbere.",
    dataLanguageChanged:
      "Jazyk údajov bol zmenený. Použije sa pri ďalšom výbere.",
    filtersReset: "Filtre pre ďalší výber boli vymazané.",
    fields: {
      cultural_background: "Kultúra a výchova",
      skills_and_expertise: "Zručnosti a znalosti",
      hobbies_and_interests: "Záľuby a záujmy",
      career_goals_and_ambitions: "Ciele a ambície",
      linguistic_background: "Jazykové zázemie",
      linguistic_persona: "Jazykový profil",
      family_persona: "Rodinné zázemie",
      age: "Vek",
      sex: "Pohlavie",
      occupation: "Povolanie",
      country: "Krajina",
      education_level: "Úroveň vzdelania",
      education_degree: "Titul",
      bachelors_field: "Študijný odbor",
      marital_status: "Rodinný stav",
      prefecture: "Prefektúra",
      city: "Mesto",
      state: "Štát",
      region: "Región",
      area: "Oblasť",
      district: "Okres",
      province: "Provincia",
      zone: "Obytná zóna",
      municipality: "Obec",
      commune: "Komúna",
      departement: "Departement",
      department: "Departement",
      planning_area: "Plánovacia oblasť",
      zipcode: "PSČ",
      industry: "Odvetvie",
      first_language: "Prvý jazyk",
      second_language: "Druhý jazyk",
      third_language: "Tretí jazyk",
      languages_spoken: "Používané jazyky",
      household_type: "Zloženie domácnosti",
      family_type: "Zloženie rodiny",
      housing_type: "Bývanie",
      military_status: "Stav vojenskej služby",
    },
    siteTitle: "Náhodné stretnutia",
  },
  ro: {
    uiLanguage: "Limba interfeței",
    synthetic: "Profiluri sintetice",
    controls: "Condiții de selecție",
    dataset: "Țară / set de date",
    dataLanguage: "Limba datelor",
    allCountries: "Toate țările",
    defaultLanguages: "Limba implicită a fiecărei țări",
    allHint:
      "Fiecare țară are aceeași probabilitate de a fi aleasă. Pentru India și Belgia se folosesc versiunile în engleză.",
    filters: "Filtre",
    optional: "Opțional",
    sex: "Sex",
    any: "Oricare",
    female: "Feminin",
    male: "Masculin",
    age: "Vârstă",
    minAge: "Fără limită minimă",
    maxAge: "Fără limită maximă",
    minAgeLabel: "Vârsta minimă",
    maxAgeLabel: "Vârsta maximă",
    filterHint:
      "Se verifică până la 300 de profiluri aleatorii. Dacă niciunul nu corespunde, repetă selecția.",
    resetFilters: "Șterge filtrele",
    draw: "Alege un profil aleatoriu",
    loading: "Încărcare…",
    cancel: "Anulează",
    usage: "Exemple de utilizare",
    usageIntro:
      "Include biografia într-o instrucțiune pentru a exersa cu un agent IA conversația în engleză sau în limba personajului. Exemplele includ automat biografia personajului afișat.",
    englishExample: "Instrucțiune pentru exersarea englezei",
    localExample: "Instrucțiune de practică: {language}",
    promptCopy: "Copiază instrucțiunea",
    promptWaiting:
      "Încarcă un profil pentru a vedea o instrucțiune cu biografia personajului.",
    background: "Biografie",
    persona: "Personaj",
    unknownName: "Nume necunoscut",
    backgroundText: "Textul biografiei",
    allFields: "Toate câmpurile",
    outputFormat: "Format de ieșire",
    copy: "Copiază",
    save: "Salvează",
    replayUrl: "Link către acest profil",
    outputPlaceholder: "Încarcă un profil de pe Hugging Face.",
    outputLabel: "Biografie de copiat",
    chars: "Caractere: {count}",
    datasetUsed: "Setul de date utilizat",
    sourceWaiting: "Setul de date va fi afișat după încărcare.",
    rows: "Rânduri: {count}",
    unverified: "Indisponibil",
    checkLicense: "Verifică licența setului de date",
    manualCopy: "Copiere manuală",
    manualCopyHint:
      "Browserul nu a permis copierea automată. Copiază manual textul selectat.",
    selectAll: "Selectează tot",
    close: "Închide",
    noScript: "Activează JavaScript pentru a folosi acest instrument.",
    basicInfo: "Informații de bază",
    personaLabel: "Descrierea personajului",
    rawDataNote:
      "Biografia personajului este afișată în limba originală a datelor.",
    promptTemplate:
      "Învăț următoarea limbă: {language}. Interpretează persoana cu biografia de mai jos și conversează cu mine în această limbă ({language}). Începe cu o scurtă prezentare, pune câte o singură întrebare și așteaptă răspunsul meu. Dacă folosesc o expresie nefirească, reformuleaz-o pe scurt înainte de a continua conversația.\n\nBiografia personajului:\n{background}",
    original: "Limba originală",
    personaLanguage: "Limba indicată în biografie",
    uiChanged: "Limba interfeței a fost schimbată.",
    fetching: "Se obțin date de la Hugging Face…",
    previousResult: "Este afișat în continuare rezultatul anterior.",
    cancelled: "Încărcarea a fost anulată.",
    fetchFailed: "Încărcarea a eșuat.",
    searching: "Se caută un profil potrivit… {round} / 3",
    drew: "A fost ales un profil aleatoriu.",
    drewFiltered: "Profil ales dintre candidații aleatorii ({count}).",
    partial: "Selecția se limitează la datele disponibile prin API.",
    revisionMissing: "Acest răspuns nu indică versiunea datelor.",
    addressUnavailable:
      "Bara de adrese nu a putut fi actualizată. Copiază „Link către acest profil”.",
    restoring: "Se încarcă profilul înregistrat în URL…",
    restoredVerified:
      "Poziția rândului, versiunea și UUID corespund valorilor din URL.",
    restored: "Rândul indicat a fost încărcat.",
    replayEnriched: "Versiunea și UUID au fost adăugate la linkul profilului.",
    replayUnverified:
      "Acest răspuns nu permite verificarea versiunii sau a UUID.",
    copied: "Textul afișat a fost copiat.",
    promptCopied: "Instrucțiunea a fost copiată.",
    urlCopied: "Linkul profilului a fost copiat.",
    saving: "Conținutul curent se salvează într-un fișier.",
    conditionsChanged:
      "Condițiile de selecție au fost schimbate. Se vor aplica la următoarea selecție.",
    dataLanguageChanged:
      "Limba datelor a fost schimbată. Se va aplica la următoarea selecție.",
    filtersReset: "Filtrele pentru următoarea selecție au fost șterse.",
    fields: {
      cultural_background: "Cultură și educație familială",
      skills_and_expertise: "Abilități și cunoștințe",
      hobbies_and_interests: "Hobby-uri și interese",
      career_goals_and_ambitions: "Obiective și aspirații",
      linguistic_background: "Context lingvistic",
      linguistic_persona: "Profil lingvistic",
      family_persona: "Context familial",
      age: "Vârstă",
      sex: "Sex",
      occupation: "Ocupație",
      country: "Țară",
      education_level: "Nivel de studii",
      education_degree: "Diplomă",
      bachelors_field: "Domeniu de studiu",
      marital_status: "Stare civilă",
      prefecture: "Prefectură",
      city: "Oraș",
      state: "Stat",
      region: "Regiune",
      area: "Zonă",
      district: "District",
      province: "Provincie",
      zone: "Zonă rezidențială",
      municipality: "Municipalitate",
      commune: "Comună",
      departement: "Departament",
      department: "Departament",
      planning_area: "Zonă de planificare",
      zipcode: "Cod poștal",
      industry: "Sector",
      first_language: "Prima limbă",
      second_language: "A doua limbă",
      third_language: "A treia limbă",
      languages_spoken: "Limbi vorbite",
      household_type: "Componența gospodăriei",
      family_type: "Componența familiei",
      housing_type: "Locuință",
      military_status: "Situație militară",
    },
    siteTitle: "Întâlniri întâmplătoare",
  },
  hu: {
    uiLanguage: "Felület nyelve",
    synthetic: "Szintetikus személyprofilok",
    controls: "Kiválasztási feltételek",
    dataset: "Ország / adatkészlet",
    dataLanguage: "Adatok nyelve",
    allCountries: "Minden ország",
    defaultLanguages: "Az egyes országok alapértelmezett nyelve",
    allHint:
      "Minden ország kiválasztása egyformán valószínű. India és Belgium esetén az angol változatot használjuk.",
    filters: "Szűrők",
    optional: "Választható",
    sex: "Nem",
    any: "Bármelyik",
    female: "Nő",
    male: "Férfi",
    age: "Életkor",
    minAge: "Nincs alsó korlát",
    maxAge: "Nincs felső korlát",
    minAgeLabel: "Legkisebb életkor",
    maxAgeLabel: "Legnagyobb életkor",
    filterHint:
      "Legfeljebb 300 véletlen profilt ellenőrzünk. Ha egyik sem felel meg, ismételje meg a kiválasztást.",
    resetFilters: "Szűrők törlése",
    draw: "Véletlen profil kiválasztása",
    loading: "Betöltés…",
    cancel: "Mégse",
    usage: "Használati példák",
    usageIntro:
      "Használja a hátteret egy utasításban, hogy egy MI-ügynökkel angolul vagy a szereplő nyelvén gyakorolhassa a társalgást. A példák automatikusan tartalmazzák a megjelenített szereplő hátterét.",
    englishExample: "Utasítás angol társalgáshoz",
    localExample: "Nyelvgyakorló utasítás: {language}",
    promptCopy: "Utasítás másolása",
    promptWaiting:
      "Töltsön be egy profilt a szereplő hátterét tartalmazó utasítás megjelenítéséhez.",
    background: "Háttér",
    persona: "Szereplő",
    unknownName: "Ismeretlen név",
    backgroundText: "Háttérszöveg",
    allFields: "Minden mező",
    outputFormat: "Kimeneti formátum",
    copy: "Másolás",
    save: "Mentés",
    replayUrl: "Hivatkozás erre a profilra",
    outputPlaceholder: "Töltsön be egy profilt a Hugging Face oldaláról.",
    outputLabel: "Másolható háttér",
    chars: "{count} karakter",
    datasetUsed: "Használt adatkészlet",
    sourceWaiting: "Az adatkészlet betöltés után jelenik meg.",
    rows: "{count} sor",
    unverified: "Nem érhető el",
    checkLicense: "Az adatkészlet licencének ellenőrzése",
    manualCopy: "Kézi másolás",
    manualCopyHint:
      "A böngésző nem engedélyezte az automatikus másolást. Másolja kézzel a kijelölt szöveget.",
    selectAll: "Összes kijelölése",
    close: "Bezárás",
    noScript: "Az eszköz használatához engedélyezze a JavaScriptet.",
    basicInfo: "Alapadatok",
    personaLabel: "Szereplő leírása",
    rawDataNote: "A szereplő háttere az adatok eredeti nyelvén jelenik meg.",
    promptTemplate:
      "A következő nyelvet tanulom: {language}. Játszd el az alábbi háttérrel rendelkező személyt, és gyakorold velem a társalgást. A beszélgetés nyelve legyen: {language}. Kezdd egy rövid bemutatkozással, egyszerre csak egy kérdést tegyél fel, és várd meg a válaszomat. Ha természetellenes kifejezést használok, röviden fogalmazd át, majd folytasd a beszélgetést.\n\nA szereplő háttere:\n{background}",
    original: "Eredeti nyelv",
    personaLanguage: "A háttérben megadott nyelv",
    uiChanged: "A felület nyelve módosítva.",
    fetching: "Adatok lekérése a Hugging Face oldaláról…",
    previousResult: "Továbbra is az előző eredmény látható.",
    cancelled: "A betöltés megszakítva.",
    fetchFailed: "A betöltés sikertelen.",
    searching: "Megfelelő profil keresése… {round} / 3",
    drew: "Egy véletlen profil kiválasztva.",
    drewFiltered: "Kiválasztás {count} véletlen jelölt közül.",
    partial: "A kiválasztás az API-n keresztül elérhető adatokra korlátozódik.",
    revisionMissing: "Ez a válasz nem jelzi az adatok verzióját.",
    addressUnavailable:
      "A címsort nem sikerült frissíteni. Másolja a „Hivatkozás erre a profilra” értékét.",
    restoring: "Az URL-ben rögzített profil betöltése…",
    restoredVerified:
      "A sor helye, a verzió és az UUID megegyezik az URL-ben tárolt értékekkel.",
    restored: "A megadott sor betöltve.",
    replayEnriched: "A verzió és az UUID hozzáadva a profil hivatkozásához.",
    replayUnverified:
      "Ebből a válaszból nem ellenőrizhető a verzió vagy az UUID.",
    copied: "A megjelenített szöveg másolva.",
    promptCopied: "Az utasítás másolva.",
    urlCopied: "A profil hivatkozása másolva.",
    saving: "Az aktuális kimenet mentése fájlba.",
    conditionsChanged:
      "A kiválasztási feltételek módosítva. A következő kiválasztásnál lépnek érvénybe.",
    dataLanguageChanged:
      "Az adatok nyelve módosítva. A következő kiválasztásnál lép érvénybe.",
    filtersReset: "A következő kiválasztás szűrői törölve.",
    fields: {
      cultural_background: "Kultúra és neveltetés",
      skills_and_expertise: "Készségek és szaktudás",
      hobbies_and_interests: "Hobbik és érdeklődés",
      career_goals_and_ambitions: "Célok és törekvések",
      linguistic_background: "Nyelvi háttér",
      linguistic_persona: "Nyelvi profil",
      family_persona: "Családi háttér",
      age: "Életkor",
      sex: "Nem",
      occupation: "Foglalkozás",
      country: "Ország",
      education_level: "Iskolázottsági szint",
      education_degree: "Végzettség",
      bachelors_field: "Tanulmányi terület",
      marital_status: "Családi állapot",
      prefecture: "Prefektúra",
      city: "Város",
      state: "Tagállam",
      region: "Régió",
      area: "Terület",
      district: "Körzet",
      province: "Tartomány",
      zone: "Lakóövezet",
      municipality: "Önkormányzat",
      commune: "Község",
      departement: "Megye",
      department: "Megye",
      planning_area: "Tervezési körzet",
      zipcode: "Irányítószám",
      industry: "Ágazat",
      first_language: "Első nyelv",
      second_language: "Második nyelv",
      third_language: "Harmadik nyelv",
      languages_spoken: "Beszélt nyelvek",
      household_type: "Háztartás összetétele",
      family_type: "Család összetétele",
      housing_type: "Lakhatás",
      military_status: "Katonai szolgálati állapot",
    },
    siteTitle: "Véletlen találkozások",
  },
  bg: {
    uiLanguage: "Език на интерфейса",
    synthetic: "Синтетични профили на хора",
    controls: "Условия за избор",
    dataset: "Държава / набор от данни",
    dataLanguage: "Език на данните",
    allCountries: "Всички държави",
    defaultLanguages: "Език по подразбиране за всяка държава",
    allHint:
      "Всяка държава има еднакъв шанс да бъде избрана. За Индия и Белгия се използват английските версии.",
    filters: "Филтри",
    optional: "По избор",
    sex: "Пол",
    any: "Без предпочитание",
    female: "Женски",
    male: "Мъжки",
    age: "Възраст",
    minAge: "Без долна граница",
    maxAge: "Без горна граница",
    minAgeLabel: "Минимална възраст",
    maxAgeLabel: "Максимална възраст",
    filterHint:
      "Проверяват се до 300 случайни профила. Ако няма подходящ, повторете избора.",
    resetFilters: "Изчистване на филтрите",
    draw: "Избор на случаен профил",
    loading: "Зареждане…",
    cancel: "Отказ",
    usage: "Примери за употреба",
    usageIntro:
      "Добавете биографията в подкана, за да упражнявате с ИИ агент разговор на английски или на езика на персонажа. Примерите автоматично включват биографията на показания персонаж.",
    englishExample: "Подкана за разговор на английски",
    localExample: "Подкана за езикова практика: {language}",
    promptCopy: "Копиране на подканата",
    promptWaiting:
      "Заредете профил, за да видите подкана с биографията на персонажа.",
    background: "Биография",
    persona: "Персонаж",
    unknownName: "Неизвестно име",
    backgroundText: "Текст на биографията",
    allFields: "Всички полета",
    outputFormat: "Изходен формат",
    copy: "Копиране",
    save: "Запазване",
    replayUrl: "Връзка към този профил",
    outputPlaceholder: "Заредете профил от Hugging Face.",
    outputLabel: "Биография за копиране",
    chars: "Брой знаци: {count}",
    datasetUsed: "Използван набор от данни",
    sourceWaiting: "Наборът от данни ще се покаже след зареждането.",
    rows: "Брой редове: {count}",
    unverified: "Не е налично",
    checkLicense: "Проверка на лиценза на данните",
    manualCopy: "Ръчно копиране",
    manualCopyHint:
      "Браузърът не разреши автоматично копиране. Копирайте избрания текст ръчно.",
    selectAll: "Избиране на всичко",
    close: "Затваряне",
    noScript: "Разрешете JavaScript, за да използвате този инструмент.",
    basicInfo: "Основна информация",
    personaLabel: "Описание на персонажа",
    rawDataNote:
      "Биографията на персонажа се показва на оригиналния език на данните.",
    promptTemplate:
      "Уча следния език: {language}. Влез в ролята на човека с биографията по-долу и разговаряй с мен на този език ({language}). Започни с кратко представяне, задавай по един въпрос и изчаквай отговора ми. Ако използвам неестествен израз, преформулирай го накратко, преди да продължиш разговора.\n\nБиография на персонажа:\n{background}",
    original: "Оригинален език",
    personaLanguage: "Език, посочен в биографията",
    uiChanged: "Езикът на интерфейса е променен.",
    fetching: "Получаване на данни от Hugging Face…",
    previousResult: "Все още се показва предишният резултат.",
    cancelled: "Зареждането е отменено.",
    fetchFailed: "Зареждането е неуспешно.",
    searching: "Търсене на подходящ профил… {round} / 3",
    drew: "Избран е случаен профил.",
    drewFiltered: "Избран е профил от {count} случайни кандидати.",
    partial: "Изборът е ограничен до данните, достъпни чрез API.",
    revisionMissing: "Този отговор не посочва версията на данните.",
    addressUnavailable:
      "Адресната лента не можа да се обнови. Копирайте „Връзка към този профил“.",
    restoring: "Зареждане на профила, записан в URL…",
    restoredVerified:
      "Позицията на реда, версията и UUID съвпадат със записаните в URL.",
    restored: "Указаният ред е зареден.",
    replayEnriched: "Версията и UUID са добавени към връзката на профила.",
    replayUnverified:
      "Този отговор не позволява проверка на версията или UUID.",
    copied: "Показаният текст е копиран.",
    promptCopied: "Подканата е копирана.",
    urlCopied: "Връзката към профила е копирана.",
    saving: "Текущият резултат се запазва във файл.",
    conditionsChanged:
      "Условията за избор са променени. Ще се приложат при следващия избор.",
    dataLanguageChanged:
      "Езикът на данните е променен. Ще се приложи при следващия избор.",
    filtersReset: "Филтрите за следващия избор са изчистени.",
    fields: {
      cultural_background: "Култура и възпитание",
      skills_and_expertise: "Умения и знания",
      hobbies_and_interests: "Хобита и интереси",
      career_goals_and_ambitions: "Цели и стремежи",
      linguistic_background: "Езикова биография",
      linguistic_persona: "Езиков профил",
      family_persona: "Семейна биография",
      age: "Възраст",
      sex: "Пол",
      occupation: "Професия",
      country: "Държава",
      education_level: "Ниво на образование",
      education_degree: "Образователна степен",
      bachelors_field: "Специалност",
      marital_status: "Семейно положение",
      prefecture: "Префектура",
      city: "Град",
      state: "Щат",
      region: "Регион",
      area: "Област",
      district: "Район",
      province: "Провинция",
      zone: "Жилищна зона",
      municipality: "Община",
      commune: "Комуна",
      departement: "Департамент",
      department: "Департамент",
      planning_area: "Зона за планиране",
      zipcode: "Пощенски код",
      industry: "Отрасъл",
      first_language: "Първи език",
      second_language: "Втори език",
      third_language: "Трети език",
      languages_spoken: "Говорими езици",
      household_type: "Състав на домакинството",
      family_type: "Състав на семейството",
      housing_type: "Жилище",
      military_status: "Статус на военна служба",
    },
    siteTitle: "Случайни срещи",
  },
  el: {
    uiLanguage: "Γλώσσα διεπαφής",
    synthetic: "Συνθετικά δεδομένα προσώπων",
    controls: "Επιλογή",
    dataset: "Χώρα / σύνολο δεδομένων",
    dataLanguage: "Γλώσσα δεδομένων",
    allCountries: "Όλες οι χώρες",
    defaultLanguages: "Προεπιλεγμένη γλώσσα κάθε χώρας",
    allHint:
      "Κάθε χώρα έχει την ίδια πιθανότητα επιλογής. Για την Ινδία και το Βέλγιο χρησιμοποιούνται οι αγγλικές εκδόσεις.",
    filters: "Φίλτρα",
    optional: "Προαιρετικά",
    sex: "Φύλο",
    any: "Χωρίς περιορισμό",
    female: "Γυναίκα",
    male: "Άνδρας",
    age: "Ηλικία",
    minAge: "Χωρίς κατώτατο όριο",
    maxAge: "Χωρίς ανώτατο όριο",
    minAgeLabel: "Ελάχιστη ηλικία",
    maxAgeLabel: "Μέγιστη ηλικία",
    filterHint:
      "Ελέγχονται έως 300 τυχαία πρόσωπα. Αν δεν βρεθεί αντιστοιχία, δοκιμάστε ξανά.",
    resetFilters: "Εκκαθάριση φίλτρων",
    draw: "Επιλογή τυχαίου προσώπου",
    loading: "Φόρτωση…",
    cancel: "Ακύρωση",
    usage: "Παραδείγματα χρήσης",
    usageIntro:
      "Χρησιμοποιήστε το υπόβαθρο σε μια προτροπή, ώστε ένας πράκτορας τεχνητής νοημοσύνης να γίνει συνομιλητής σας στα αγγλικά ή στη γλώσσα του προσώπου. Τα παραδείγματα περιλαμβάνουν αυτόματα το υπόβαθρο του προσώπου που εμφανίζεται.",
    englishExample: "Προτροπή για συζήτηση στα αγγλικά",
    localExample: "Προτροπή εξάσκησης: {language}",
    promptCopy: "Αντιγραφή προτροπής",
    promptWaiting:
      "Επιλέξτε ένα πρόσωπο για να δείτε μια προτροπή με το υπόβαθρό του.",
    background: "Υπόβαθρο",
    persona: "Πρόσωπο",
    unknownName: "Μη διαθέσιμο όνομα",
    backgroundText: "Κείμενο υποβάθρου",
    allFields: "Όλα τα πεδία",
    outputFormat: "Μορφή εξόδου",
    copy: "Αντιγραφή",
    save: "Αποθήκευση",
    replayUrl: "Σύνδεσμος αυτού του προσώπου",
    outputPlaceholder: "Φορτώστε ένα πρόσωπο από το Hugging Face.",
    outputLabel: "Υπόβαθρο προς αντιγραφή",
    chars: "{count} χαρακτήρες",
    datasetUsed: "Σύνολο δεδομένων που χρησιμοποιείται",
    sourceWaiting: "Το σύνολο δεδομένων θα εμφανιστεί μετά τη φόρτωση.",
    rows: "{count} γραμμές",
    unverified: "Μη διαθέσιμο",
    checkLicense: "Έλεγχος άδειας συνόλου δεδομένων",
    manualCopy: "Χειροκίνητη αντιγραφή",
    manualCopyHint:
      "Το πρόγραμμα περιήγησης δεν επέτρεψε την αυτόματη αντιγραφή. Αντιγράψτε χειροκίνητα το επιλεγμένο κείμενο.",
    selectAll: "Επιλογή όλων",
    close: "Κλείσιμο",
    noScript:
      "Ενεργοποιήστε τη JavaScript για να χρησιμοποιήσετε αυτό το εργαλείο.",
    basicInfo: "Βασικές πληροφορίες",
    personaLabel: "Προφίλ",
    rawDataNote:
      "Το υπόβαθρο του προσώπου εμφανίζεται στην αρχική γλώσσα των δεδομένων.",
    promptTemplate:
      "Μαθαίνω {language}. Υποδύσου το πρόσωπο με το παρακάτω υπόβαθρο και κάνε μαζί μου εξάσκηση στη συζήτηση στη γλώσσα {language}. Ξεκίνα με μια σύντομη αυτοπαρουσίαση, κάνε μία ερώτηση κάθε φορά και περίμενε την απάντησή μου. Αν χρησιμοποιήσω μια αφύσικη έκφραση, αναδιατύπωσέ τη σύντομα πριν συνεχίσεις τη συζήτηση.\n\nΥπόβαθρο προσώπου:\n{background}",
    original: "Αρχική γλώσσα",
    personaLanguage: "Γλώσσα που αναφέρεται στο υπόβαθρο",
    uiChanged: "Η γλώσσα διεπαφής άλλαξε.",
    fetching: "Ανάκτηση από το Hugging Face…",
    previousResult: "Εξακολουθεί να εμφανίζεται το προηγούμενο αποτέλεσμα.",
    cancelled: "Η φόρτωση ακυρώθηκε.",
    fetchFailed: "Η φόρτωση απέτυχε.",
    searching: "Αναζήτηση προσώπου που ταιριάζει… {round} / 3",
    drew: "Επιλέχθηκε ένα τυχαίο πρόσωπο.",
    drewFiltered: "Η επιλογή έγινε ανάμεσα σε {count} τυχαία πρόσωπα.",
    partial:
      "Η επιλογή περιορίζεται στα δεδομένα που διατίθενται μέσω του API.",
    revisionMissing:
      "Αυτή η απόκριση δεν προσδιορίζει την έκδοση των δεδομένων.",
    addressUnavailable:
      "Δεν ήταν δυνατή η ενημέρωση της γραμμής διευθύνσεων. Αντιγράψτε τον «Σύνδεσμο αυτού του προσώπου».",
    restoring: "Φόρτωση του προσώπου που έχει καταγραφεί στο URL…",
    restoredVerified:
      "Επιβεβαιώθηκαν η θέση γραμμής, η έκδοση και το UUID που έχουν καταγραφεί στο URL.",
    restored: "Φορτώθηκε η καθορισμένη γραμμή.",
    replayEnriched:
      "Η έκδοση και το UUID προστέθηκαν στον σύνδεσμο του προσώπου.",
    replayUnverified:
      "Αυτή η απόκριση δεν επιτρέπει την επαλήθευση της έκδοσης ή του UUID.",
    copied: "Το εμφανιζόμενο κείμενο αντιγράφηκε.",
    promptCopied: "Η προτροπή αντιγράφηκε.",
    urlCopied: "Ο σύνδεσμος του προσώπου αντιγράφηκε.",
    saving: "Αποθήκευση της τρέχουσας εξόδου σε αρχείο.",
    conditionsChanged:
      "Οι συνθήκες επιλογής άλλαξαν. Θα ισχύσουν στην επόμενη επιλογή.",
    dataLanguageChanged:
      "Η γλώσσα δεδομένων άλλαξε. Θα ισχύσει στην επόμενη επιλογή.",
    filtersReset: "Τα φίλτρα για την επόμενη επιλογή εκκαθαρίστηκαν.",
    fields: {
      cultural_background: "Πολιτισμός και ανατροφή",
      skills_and_expertise: "Δεξιότητες και εξειδίκευση",
      hobbies_and_interests: "Χόμπι και ενδιαφέροντα",
      career_goals_and_ambitions: "Στόχοι και φιλοδοξίες",
      linguistic_background: "Γλωσσικό υπόβαθρο",
      linguistic_persona: "Γλωσσικό προφίλ",
      family_persona: "Οικογενειακό προφίλ",
      age: "Ηλικία",
      sex: "Φύλο",
      occupation: "Επάγγελμα",
      country: "Χώρα",
      education_level: "Επίπεδο εκπαίδευσης",
      education_degree: "Τίτλος σπουδών",
      bachelors_field: "Αντικείμενο σπουδών",
      marital_status: "Οικογενειακή κατάσταση",
      prefecture: "Νομός",
      city: "Πόλη",
      state: "Πολιτεία",
      region: "Περιφέρεια",
      area: "Περιοχή",
      district: "Διαμέρισμα",
      province: "Επαρχία",
      zone: "Ζώνη κατοικίας",
      municipality: "Δήμος",
      commune: "Κοινότητα",
      departement: "Διοικητικό διαμέρισμα",
      department: "Διοικητικό διαμέρισμα",
      planning_area: "Περιοχή πολεοδομικού σχεδιασμού",
      zipcode: "Ταχυδρομικός κώδικας",
      industry: "Κλάδος",
      first_language: "Πρώτη γλώσσα",
      second_language: "Δεύτερη γλώσσα",
      third_language: "Τρίτη γλώσσα",
      languages_spoken: "Ομιλούμενες γλώσσες",
      household_type: "Τύπος νοικοκυριού",
      family_type: "Τύπος οικογένειας",
      housing_type: "Κατοικία",
      military_status: "Στρατολογική κατάσταση",
    },
    siteTitle: "Τυχαίες συναντήσεις",
  },
  tr: {
    uiLanguage: "Arayüz dili",
    synthetic: "Sentetik kişi profili verileri",
    controls: "Seçim",
    dataset: "Ülke / veri kümesi",
    dataLanguage: "Veri dili",
    allCountries: "Tüm ülkeler",
    defaultLanguages: "Her ülkenin varsayılan dili",
    allHint:
      "Her ülkenin seçilme olasılığı eşittir. Hindistan ve Belçika için İngilizce sürümler kullanılır.",
    filters: "Filtreler",
    optional: "İsteğe bağlı",
    sex: "Cinsiyet",
    any: "Fark etmez",
    female: "Kadın",
    male: "Erkek",
    age: "Yaş",
    minAge: "Alt sınır yok",
    maxAge: "Üst sınır yok",
    minAgeLabel: "En düşük yaş",
    maxAgeLabel: "En yüksek yaş",
    filterHint:
      "En fazla 300 rastgele aday incelenir. Eşleşme bulunamazsa yeniden deneyin.",
    resetFilters: "Filtreleri temizle",
    draw: "Rastgele bir kişi profili seç",
    loading: "Yükleniyor…",
    cancel: "İptal",
    usage: "Kullanım örnekleri",
    usageIntro:
      "Geçmiş bilgilerini bir istemde kullanarak yapay zekâ aracısını İngilizce veya kişinin dilinde bir sohbet arkadaşına dönüştürün. Örnekler, görüntülenen kişinin geçmişini otomatik olarak içerir.",
    englishExample: "İngilizce konuşma istemi",
    localExample: "{language} pratiği için istem",
    promptCopy: "İstemi kopyala",
    promptWaiting:
      "Geçmişini içeren bir istem görmek için bir kişi profili seçin.",
    background: "Geçmiş bilgileri",
    persona: "Kişi profili",
    unknownName: "Ad mevcut değil",
    backgroundText: "Geçmiş metni",
    allFields: "Tüm alanlar",
    outputFormat: "Çıktı biçimi",
    copy: "Kopyala",
    save: "Kaydet",
    replayUrl: "Bu kişinin bağlantısı",
    outputPlaceholder: "Hugging Face üzerinden bir kişi profili yükleyin.",
    outputLabel: "Kopyalanacak geçmiş bilgileri",
    chars: "{count} karakter",
    datasetUsed: "Kullanılan veri kümesi",
    sourceWaiting: "Veri kümesi yüklendikten sonra görünecek.",
    rows: "{count} satır",
    unverified: "Mevcut değil",
    checkLicense: "Veri kümesinin lisansını incele",
    manualCopy: "Elle kopyala",
    manualCopyHint:
      "Tarayıcı otomatik kopyalamaya izin vermedi. Seçili metni elle kopyalayın.",
    selectAll: "Tümünü seç",
    close: "Kapat",
    noScript: "Bu aracı kullanmak için JavaScript'i etkinleştirin.",
    basicInfo: "Temel bilgiler",
    personaLabel: "Profil",
    rawDataNote: "Kişinin geçmişi, verilerin özgün dilinde gösterilir.",
    promptTemplate:
      "{language} öğreniyorum. Aşağıda geçmişi verilen kişiyi canlandır ve benimle {language} dilinde konuşma pratiği yap. Önce kendini kısaca tanıt, her seferinde bir soru sor ve yanıtımı bekle. Doğal olmayan bir ifade kullanırsam konuşmaya devam etmeden önce bunu kısaca daha doğal bir şekilde ifade et.\n\nKişinin geçmişi:\n{background}",
    original: "Özgün dil",
    personaLanguage: "Geçmiş bilgilerinde belirtilen dil",
    uiChanged: "Arayüz dili değiştirildi.",
    fetching: "Hugging Face üzerinden veriler alınıyor…",
    previousResult: "Önceki sonuç hâlâ görüntüleniyor.",
    cancelled: "Yükleme iptal edildi.",
    fetchFailed: "Yükleme başarısız oldu.",
    searching: "Eşleşen bir kişi profili aranıyor… {round} / 3",
    drew: "Rastgele bir kişi profili seçildi.",
    drewFiltered: "{count} rastgele aday arasından seçildi.",
    partial: "Seçim, API üzerinden erişilebilen verilerle sınırlıdır.",
    revisionMissing: "Bu yanıtta veri sürümü belirtilmiyor.",
    addressUnavailable:
      "Adres çubuğu güncellenemedi. “Bu kişinin bağlantısı” seçeneğini kullanarak bağlantıyı kopyalayın.",
    restoring: "URL'de kayıtlı kişi profili yükleniyor…",
    restoredVerified: "URL'de kayıtlı satır konumu, sürüm ve UUID doğrulandı.",
    restored: "Belirtilen satır yüklendi.",
    replayEnriched: "Bu kişinin bağlantısına sürüm ve UUID eklendi.",
    replayUnverified:
      "Bu yanıt, sürümün veya UUID'nin doğrulanmasına olanak vermiyor.",
    copied: "Görüntülenen metin kopyalandı.",
    promptCopied: "İstem kopyalandı.",
    urlCopied: "Bu kişinin bağlantısı kopyalandı.",
    saving: "Mevcut çıktı bir dosyaya kaydediliyor.",
    conditionsChanged:
      "Seçim koşulları değiştirildi. Sonraki seçimde uygulanacak.",
    dataLanguageChanged: "Veri dili değiştirildi. Sonraki seçimde uygulanacak.",
    filtersReset: "Sonraki seçim için filtreler temizlendi.",
    fields: {
      cultural_background: "Kültür ve yetişme ortamı",
      skills_and_expertise: "Beceriler ve uzmanlık",
      hobbies_and_interests: "Hobiler ve ilgi alanları",
      career_goals_and_ambitions: "Hedefler ve beklentiler",
      linguistic_background: "Dil geçmişi",
      linguistic_persona: "Dil profili",
      family_persona: "Aile profili",
      age: "Yaş",
      sex: "Cinsiyet",
      occupation: "Meslek",
      country: "Ülke",
      education_level: "Eğitim düzeyi",
      education_degree: "Diploma",
      bachelors_field: "Öğrenim alanı",
      marital_status: "Medeni durum",
      prefecture: "Prefektörlük",
      city: "Şehir",
      state: "Eyalet",
      region: "Bölge",
      area: "Yöre",
      district: "İlçe",
      province: "İl",
      zone: "Yerleşim bölgesi",
      municipality: "Belediye",
      commune: "Komün",
      departement: "İdari bölge",
      department: "İdari bölge",
      planning_area: "Planlama bölgesi",
      zipcode: "Posta kodu",
      industry: "Sektör",
      first_language: "Birinci dil",
      second_language: "İkinci dil",
      third_language: "Üçüncü dil",
      languages_spoken: "Konuşulan diller",
      household_type: "Hane türü",
      family_type: "Aile türü",
      housing_type: "Konut",
      military_status: "Askerlik durumu",
    },
    siteTitle: "Tesadüfi karşılaşmalar",
  },
  sv: {
    uiLanguage: "Gränssnittsspråk",
    synthetic: "Syntetiska personprofiler",
    controls: "Urval",
    dataset: "Land / datamängd",
    dataLanguage: "Dataspråk",
    allCountries: "Alla länder",
    defaultLanguages: "Förvalt språk för varje land",
    allHint:
      "Alla länder har lika stor chans att väljas. För Indien och Belgien används de engelska versionerna.",
    filters: "Filter",
    optional: "Valfritt",
    sex: "Kön",
    any: "Alla",
    female: "Kvinna",
    male: "Man",
    age: "Ålder",
    minAge: "Ingen nedre gräns",
    maxAge: "Ingen övre gräns",
    minAgeLabel: "Lägsta ålder",
    maxAgeLabel: "Högsta ålder",
    filterHint:
      "Upp till 300 slumpmässiga kandidater kontrolleras. Försök igen om ingen passar.",
    resetFilters: "Rensa filter",
    draw: "Välj en slumpmässig person",
    loading: "Läser in…",
    cancel: "Avbryt",
    usage: "Exempel på användning",
    usageIntro:
      "Använd bakgrunden i en instruktion för att göra en AI-agent till en samtalspartner på engelska eller personens språk. Exemplen innehåller automatiskt bakgrunden för personen som visas.",
    englishExample: "Instruktion för samtal på engelska",
    localExample: "Instruktion för att öva {language}",
    promptCopy: "Kopiera instruktionen",
    promptWaiting:
      "Välj en person för att se en instruktion med personens bakgrund.",
    background: "Bakgrund",
    persona: "Personprofil",
    unknownName: "Namn saknas",
    backgroundText: "Bakgrundstext",
    allFields: "Alla fält",
    outputFormat: "Utdataformat",
    copy: "Kopiera",
    save: "Spara",
    replayUrl: "Länk till den här personen",
    outputPlaceholder: "Läs in en personprofil från Hugging Face.",
    outputLabel: "Bakgrund att kopiera",
    chars: "{count} tecken",
    datasetUsed: "Använd datamängd",
    sourceWaiting: "Datamängden visas efter inläsningen.",
    rows: "{count} rader",
    unverified: "Ej tillgängligt",
    checkLicense: "Kontrollera datamängdens licens",
    manualCopy: "Kopiera manuellt",
    manualCopyHint:
      "Webbläsaren tillät inte automatisk kopiering. Kopiera den markerade texten manuellt.",
    selectAll: "Markera allt",
    close: "Stäng",
    noScript: "Aktivera JavaScript för att använda verktyget.",
    basicInfo: "Grundläggande information",
    personaLabel: "Profil",
    rawDataNote: "Personens bakgrund visas på datamängdens originalspråk.",
    promptTemplate:
      "Jag lär mig {language}. Spela personen med bakgrunden nedan och öva samtal med mig på {language}. Börja med en kort presentation av dig själv, ställ en fråga i taget och vänta på mitt svar. Om jag använder ett onaturligt uttryck, formulera kort om det innan du fortsätter samtalet.\n\nPersonens bakgrund:\n{background}",
    original: "Originalspråk",
    personaLanguage: "Språk som anges i bakgrunden",
    uiChanged: "Gränssnittsspråket har ändrats.",
    fetching: "Hämtar från Hugging Face…",
    previousResult: "Det föregående resultatet visas fortfarande.",
    cancelled: "Inläsningen avbröts.",
    fetchFailed: "Inläsningen misslyckades.",
    searching: "Letar efter en person som passar… {round} / 3",
    drew: "En slumpmässig person valdes.",
    drewFiltered: "Valde bland {count} slumpmässiga kandidater.",
    partial:
      "Urvalet är begränsat till de data som är tillgängliga via API:et.",
    revisionMissing: "Svaret anger inte dataversionen.",
    addressUnavailable:
      "Adressfältet kunde inte uppdateras. Kopiera ”Länk till den här personen”.",
    restoring: "Läser in personen som finns registrerad i länken…",
    restoredVerified:
      "Radpositionen, versionen och UUID som anges i länken har bekräftats.",
    restored: "Den angivna raden lästes in.",
    replayEnriched: "Version och UUID lades till i länken till personen.",
    replayUnverified:
      "Svaret gör det inte möjligt att verifiera version eller UUID.",
    copied: "Den visade texten kopierades.",
    promptCopied: "Instruktionen kopierades.",
    urlCopied: "Länken till personen kopierades.",
    saving: "Sparar det aktuella resultatet i en fil.",
    conditionsChanged:
      "Urvalsvillkoren har ändrats. De gäller vid nästa urval.",
    dataLanguageChanged: "Dataspråket har ändrats. Det gäller vid nästa urval.",
    filtersReset: "Filtren för nästa urval har rensats.",
    fields: {
      cultural_background: "Kultur och uppväxt",
      skills_and_expertise: "Färdigheter och expertis",
      hobbies_and_interests: "Fritidsintressen",
      career_goals_and_ambitions: "Mål och ambitioner",
      linguistic_background: "Språklig bakgrund",
      linguistic_persona: "Språkprofil",
      family_persona: "Familjeprofil",
      age: "Ålder",
      sex: "Kön",
      occupation: "Yrke",
      country: "Land",
      education_level: "Utbildningsnivå",
      education_degree: "Examen",
      bachelors_field: "Studieinriktning",
      marital_status: "Civilstånd",
      prefecture: "Prefektur",
      city: "Stad",
      state: "Delstat",
      region: "Region",
      area: "Område",
      district: "Distrikt",
      province: "Provins",
      zone: "Bostadsområde",
      municipality: "Kommun",
      commune: "Kommun",
      departement: "Departement",
      department: "Departement",
      planning_area: "Planeringsområde",
      zipcode: "Postnummer",
      industry: "Bransch",
      first_language: "Förstaspråk",
      second_language: "Andraspråk",
      third_language: "Tredjespråk",
      languages_spoken: "Talade språk",
      household_type: "Hushållstyp",
      family_type: "Familjetyp",
      housing_type: "Boende",
      military_status: "Värnpliktsstatus",
    },
    siteTitle: "Oväntade möten",
  },
  da: {
    uiLanguage: "Grænsefladesprog",
    synthetic: "Syntetiske personprofiler",
    controls: "Udvælgelse",
    dataset: "Land / datasæt",
    dataLanguage: "Datasprog",
    allCountries: "Alle lande",
    defaultLanguages: "Standardsprog for hvert land",
    allHint:
      "Alle lande har samme chance for at blive valgt. For Indien og Belgien bruges de engelske versioner.",
    filters: "Filtre",
    optional: "Valgfrit",
    sex: "Køn",
    any: "Alle",
    female: "Kvinde",
    male: "Mand",
    age: "Alder",
    minAge: "Ingen nedre grænse",
    maxAge: "Ingen øvre grænse",
    minAgeLabel: "Laveste alder",
    maxAgeLabel: "Højeste alder",
    filterHint:
      "Op til 300 tilfældige kandidater undersøges. Prøv igen, hvis ingen matcher.",
    resetFilters: "Ryd filtre",
    draw: "Vælg en tilfældig person",
    loading: "Indlæser…",
    cancel: "Annuller",
    usage: "Eksempler på brug",
    usageIntro:
      "Brug baggrunden i en instruktion for at gøre en AI-agent til en samtalepartner på engelsk eller personens sprog. Eksemplerne indeholder automatisk baggrunden for den viste person.",
    englishExample: "Instruktion til samtale på engelsk",
    localExample: "Instruktion til at øve {language}",
    promptCopy: "Kopiér instruktionen",
    promptWaiting:
      "Vælg en person for at se en instruktion med personens baggrund.",
    background: "Baggrund",
    persona: "Personprofil",
    unknownName: "Navn ikke tilgængeligt",
    backgroundText: "Baggrundstekst",
    allFields: "Alle felter",
    outputFormat: "Resultatformat",
    copy: "Kopiér",
    save: "Gem",
    replayUrl: "Link til denne person",
    outputPlaceholder: "Indlæs en personprofil fra Hugging Face.",
    outputLabel: "Baggrund til kopiering",
    chars: "{count} tegn",
    datasetUsed: "Anvendt datasæt",
    sourceWaiting: "Datasættet vises efter indlæsning.",
    rows: "{count} rækker",
    unverified: "Ikke tilgængeligt",
    checkLicense: "Se datasættets licens",
    manualCopy: "Kopiér manuelt",
    manualCopyHint:
      "Browseren tillod ikke automatisk kopiering. Kopiér den markerede tekst manuelt.",
    selectAll: "Markér alt",
    close: "Luk",
    noScript: "Aktivér JavaScript for at bruge dette værktøj.",
    basicInfo: "Grundlæggende oplysninger",
    personaLabel: "Profil",
    rawDataNote: "Personens baggrund vises på dataenes originalsprog.",
    promptTemplate:
      "Jeg er ved at lære {language}. Spil personen med baggrunden nedenfor, og øv samtale med mig på {language}. Begynd med en kort præsentation af dig selv, stil ét spørgsmål ad gangen, og vent på mit svar. Hvis jeg bruger et unaturligt udtryk, så omformulér det kort, før du fortsætter samtalen.\n\nPersonens baggrund:\n{background}",
    original: "Originalsprog",
    personaLanguage: "Sprog angivet i baggrunden",
    uiChanged: "Grænsefladesproget er ændret.",
    fetching: "Henter fra Hugging Face…",
    previousResult: "Det forrige resultat vises stadig.",
    cancelled: "Indlæsningen er annulleret.",
    fetchFailed: "Indlæsningen mislykkedes.",
    searching: "Søger efter en person, der matcher… {round} / 3",
    drew: "En tilfældig person blev valgt.",
    drewFiltered: "Valgt blandt {count} tilfældige kandidater.",
    partial:
      "Udvælgelsen er begrænset til de data, der er tilgængelige via API'et.",
    revisionMissing: "Dette svar angiver ikke dataversionen.",
    addressUnavailable:
      "Adresselinjen kunne ikke opdateres. Kopiér »Link til denne person«.",
    restoring: "Indlæser personen, der er registreret i linket…",
    restoredVerified:
      "Rækkeposition, version og UUID registreret i linket er bekræftet.",
    restored: "Den angivne række er indlæst.",
    replayEnriched: "Version og UUID er føjet til personens link.",
    replayUnverified:
      "Dette svar gør det ikke muligt at bekræfte versionen eller UUID.",
    copied: "Den viste tekst er kopieret.",
    promptCopied: "Instruktionen er kopieret.",
    urlCopied: "Linket til personen er kopieret.",
    saving: "Gemmer det aktuelle resultat i en fil.",
    conditionsChanged:
      "Betingelserne for udvælgelse er ændret. De gælder ved næste udvælgelse.",
    dataLanguageChanged:
      "Datasproget er ændret. Det gælder ved næste udvælgelse.",
    filtersReset: "Filtrene til næste udvælgelse er ryddet.",
    fields: {
      cultural_background: "Kultur og opvækst",
      skills_and_expertise: "Færdigheder og ekspertise",
      hobbies_and_interests: "Hobbyer og interesser",
      career_goals_and_ambitions: "Mål og ambitioner",
      linguistic_background: "Sproglig baggrund",
      linguistic_persona: "Sprogprofil",
      family_persona: "Familieprofil",
      age: "Alder",
      sex: "Køn",
      occupation: "Erhverv",
      country: "Land",
      education_level: "Uddannelsesniveau",
      education_degree: "Uddannelsesgrad",
      bachelors_field: "Studieretning",
      marital_status: "Civilstand",
      prefecture: "Præfektur",
      city: "By",
      state: "Delstat",
      region: "Region",
      area: "Område",
      district: "Distrikt",
      province: "Provins",
      zone: "Boligområde",
      municipality: "Kommune",
      commune: "Kommune",
      departement: "Departement",
      department: "Departement",
      planning_area: "Planlægningsområde",
      zipcode: "Postnummer",
      industry: "Branche",
      first_language: "Førstesprog",
      second_language: "Andetsprog",
      third_language: "Tredjesprog",
      languages_spoken: "Talte sprog",
      household_type: "Husstandstype",
      family_type: "Familietype",
      housing_type: "Bolig",
      military_status: "Status for militærtjeneste",
    },
    siteTitle: "Tilfældige møder",
  },
  no: {
    uiLanguage: "Grensesnittspråk",
    synthetic: "Syntetiske personprofiler",
    controls: "Utvalg",
    dataset: "Land / datasett",
    dataLanguage: "Dataspråk",
    allCountries: "Alle land",
    defaultLanguages: "Standardspråk for hvert land",
    allHint:
      "Alle land har like stor sjanse til å bli valgt. For India og Belgia brukes de engelske versjonene.",
    filters: "Filtre",
    optional: "Valgfritt",
    sex: "Kjønn",
    any: "Alle",
    female: "Kvinne",
    male: "Mann",
    age: "Alder",
    minAge: "Ingen nedre grense",
    maxAge: "Ingen øvre grense",
    minAgeLabel: "Laveste alder",
    maxAgeLabel: "Høyeste alder",
    filterHint:
      "Opptil 300 tilfeldige kandidater undersøkes. Prøv igjen hvis ingen passer.",
    resetFilters: "Tøm filtre",
    draw: "Velg en tilfeldig person",
    loading: "Laster inn…",
    cancel: "Avbryt",
    usage: "Eksempler på bruk",
    usageIntro:
      "Bruk bakgrunnen i en instruksjon for å gjøre en KI-agent til en samtalepartner på engelsk eller personens språk. Eksemplene inkluderer automatisk bakgrunnen til personen som vises.",
    englishExample: "Instruksjon for samtale på engelsk",
    localExample: "Instruksjon for å øve på {language}",
    promptCopy: "Kopier instruksjonen",
    promptWaiting:
      "Velg en person for å se en instruksjon med personens bakgrunn.",
    background: "Bakgrunn",
    persona: "Personprofil",
    unknownName: "Navn ikke tilgjengelig",
    backgroundText: "Bakgrunnstekst",
    allFields: "Alle felt",
    outputFormat: "Resultatformat",
    copy: "Kopier",
    save: "Lagre",
    replayUrl: "Lenke til denne personen",
    outputPlaceholder: "Last inn en personprofil fra Hugging Face.",
    outputLabel: "Bakgrunn som kan kopieres",
    chars: "{count} tegn",
    datasetUsed: "Datasett som brukes",
    sourceWaiting: "Datasettet vises etter innlasting.",
    rows: "{count} rader",
    unverified: "Ikke tilgjengelig",
    checkLicense: "Se lisensen for datasettet",
    manualCopy: "Kopier manuelt",
    manualCopyHint:
      "Nettleseren tillot ikke automatisk kopiering. Kopier den markerte teksten manuelt.",
    selectAll: "Merk alt",
    close: "Lukk",
    noScript: "Aktiver JavaScript for å bruke dette verktøyet.",
    basicInfo: "Grunnleggende opplysninger",
    personaLabel: "Profil",
    rawDataNote: "Personens bakgrunn vises på dataenes originalspråk.",
    promptTemplate:
      "Jeg lærer {language}. Spill personen med bakgrunnen nedenfor, og øv på samtale med meg på {language}. Begynn med en kort presentasjon av deg selv, still ett spørsmål om gangen, og vent på svaret mitt. Hvis jeg bruker et unaturlig uttrykk, omformuler det kort før du fortsetter samtalen.\n\nPersonens bakgrunn:\n{background}",
    original: "Originalspråk",
    personaLanguage: "Språk oppgitt i bakgrunnen",
    uiChanged: "Grensesnittspråket er endret.",
    fetching: "Henter fra Hugging Face…",
    previousResult: "Det forrige resultatet vises fortsatt.",
    cancelled: "Innlastingen ble avbrutt.",
    fetchFailed: "Innlastingen mislyktes.",
    searching: "Leter etter en person som passer… {round} / 3",
    drew: "Én tilfeldig person ble valgt.",
    drewFiltered: "Valgt blant {count} tilfeldige kandidater.",
    partial:
      "Utvalget er begrenset til dataene som er tilgjengelige via API-et.",
    revisionMissing: "Dette svaret oppgir ikke dataversjonen.",
    addressUnavailable:
      "Adressefeltet kunne ikke oppdateres. Kopier «Lenke til denne personen».",
    restoring: "Laster inn personen som er registrert i lenken…",
    restoredVerified:
      "Radposisjonen, versjonen og UUID-en som er registrert i lenken, er bekreftet.",
    restored: "Den angitte raden ble lastet inn.",
    replayEnriched: "Versjon og UUID ble lagt til i personens lenke.",
    replayUnverified:
      "Dette svaret gjør det ikke mulig å bekrefte versjonen eller UUID-en.",
    copied: "Teksten som vises, ble kopiert.",
    promptCopied: "Instruksjonen ble kopiert.",
    urlCopied: "Lenken til personen ble kopiert.",
    saving: "Lagrer det gjeldende resultatet i en fil.",
    conditionsChanged:
      "Vilkårene for utvalget er endret. De gjelder ved neste utvalg.",
    dataLanguageChanged: "Dataspråket er endret. Det gjelder ved neste utvalg.",
    filtersReset: "Filtrene for neste utvalg er tømt.",
    fields: {
      cultural_background: "Kultur og oppvekst",
      skills_and_expertise: "Ferdigheter og ekspertise",
      hobbies_and_interests: "Hobbyer og interesser",
      career_goals_and_ambitions: "Mål og ambisjoner",
      linguistic_background: "Språklig bakgrunn",
      linguistic_persona: "Språkprofil",
      family_persona: "Familieprofil",
      age: "Alder",
      sex: "Kjønn",
      occupation: "Yrke",
      country: "Land",
      education_level: "Utdanningsnivå",
      education_degree: "Utdanningsgrad",
      bachelors_field: "Studieretning",
      marital_status: "Sivilstand",
      prefecture: "Prefektur",
      city: "By",
      state: "Delstat",
      region: "Region",
      area: "Område",
      district: "Distrikt",
      province: "Provins",
      zone: "Boligområde",
      municipality: "Kommune",
      commune: "Kommune",
      departement: "Departement",
      department: "Departement",
      planning_area: "Planleggingsområde",
      zipcode: "Postnummer",
      industry: "Bransje",
      first_language: "Førstespråk",
      second_language: "Andrespråk",
      third_language: "Tredjespråk",
      languages_spoken: "Språk personen snakker",
      household_type: "Husholdningstype",
      family_type: "Familietype",
      housing_type: "Bolig",
      military_status: "Status for militærtjeneste",
    },
    siteTitle: "Tilfeldige møter",
  },
  fi: {
    uiLanguage: "Käyttöliittymän kieli",
    synthetic: "Synteettiset henkilöprofiilit",
    controls: "Valinta",
    dataset: "Maa / aineisto",
    dataLanguage: "Aineiston kieli",
    allCountries: "Kaikki maat",
    defaultLanguages: "Kunkin maan oletuskieli",
    allHint:
      "Jokainen maa valitaan yhtä suurella todennäköisyydellä. Intiasta ja Belgiasta käytetään englanninkielisiä versioita.",
    filters: "Suodattimet",
    optional: "Valinnainen",
    sex: "Sukupuoli",
    any: "Ei rajausta",
    female: "Nainen",
    male: "Mies",
    age: "Ikä",
    minAge: "Ei alarajaa",
    maxAge: "Ei ylärajaa",
    minAgeLabel: "Vähimmäisikä",
    maxAgeLabel: "Enimmäisikä",
    filterHint:
      "Tarkistaa enintään 300 satunnaista ehdokasta. Yritä uudelleen, jos sopivaa ei löydy.",
    resetFilters: "Tyhjennä suodattimet",
    draw: "Valitse satunnainen henkilö",
    loading: "Ladataan…",
    cancel: "Peruuta",
    usage: "Käyttöesimerkkejä",
    usageIntro:
      "Käytä taustatietoja kehotteessa, jotta tekoälyagentti toimii keskustelukumppanina englanniksi tai henkilön kielellä. Esimerkit sisältävät automaattisesti näytettävän henkilön taustatiedot.",
    englishExample: "Kehote englannin keskusteluharjoitteluun",
    localExample: "Kieliharjoittelun kehote: {language}",
    promptCopy: "Kopioi kehote",
    promptWaiting:
      "Valitse henkilö, niin näet hänen taustatietonsa sisältävän kehotteen.",
    background: "Taustatiedot",
    persona: "Henkilö",
    unknownName: "Nimeä ei ole saatavilla",
    backgroundText: "Taustateksti",
    allFields: "Kaikki kentät",
    outputFormat: "Tulostusmuoto",
    copy: "Kopioi",
    save: "Tallenna",
    replayUrl: "Linkki tähän henkilöön",
    outputPlaceholder: "Lataa henkilöprofiili Hugging Facesta.",
    outputLabel: "Kopioitavat taustatiedot",
    chars: "{count} merkkiä",
    datasetUsed: "Käytetty aineisto",
    sourceWaiting: "Aineisto näkyy latauksen jälkeen.",
    rows: "{count} riviä",
    unverified: "Ei saatavilla",
    checkLicense: "Tarkista aineiston lisenssi",
    manualCopy: "Kopioi käsin",
    manualCopyHint:
      "Selain ei sallinut automaattista kopiointia. Kopioi valittu teksti käsin.",
    selectAll: "Valitse kaikki",
    close: "Sulje",
    noScript: "Ota JavaScript käyttöön, jotta voit käyttää tätä työkalua.",
    basicInfo: "Perustiedot",
    personaLabel: "Profiili",
    rawDataNote:
      "Henkilön taustatiedot näytetään aineiston alkuperäisellä kielellä.",
    promptTemplate:
      "Opiskelen tätä kieltä: {language}. Esitä henkilöä, jonka tausta on alla, ja harjoittele keskustelua kanssani. Keskustelun kieli on {language}. Aloita lyhyellä esittelyllä itsestäsi, esitä yksi kysymys kerrallaan ja odota vastaustani. Jos käytän epäluontevaa ilmausta, muotoile se lyhyesti uudelleen ennen kuin jatkat keskustelua.\n\nHenkilön taustatiedot:\n{background}",
    original: "Alkuperäinen kieli",
    personaLanguage: "Taustatiedoissa mainittu kieli",
    uiChanged: "Käyttöliittymän kieli vaihdettu.",
    fetching: "Haetaan Hugging Facesta…",
    previousResult: "Edellinen tulos on edelleen näkyvissä.",
    cancelled: "Lataus peruutettu.",
    fetchFailed: "Lataus epäonnistui.",
    searching: "Etsitään sopivaa henkilöä… {round} / 3",
    drew: "Yksi satunnainen henkilö valittiin.",
    drewFiltered: "Valinta tehtiin {count} satunnaisen ehdokkaan joukosta.",
    partial:
      "Valinta rajoittuu rajapinnan kautta saatavilla oleviin tietoihin.",
    revisionMissing: "Tämä vastaus ei ilmoita aineiston versiota.",
    addressUnavailable:
      "Osoiteriviä ei voitu päivittää. Kopioi ”Linkki tähän henkilöön”.",
    restoring: "Ladataan URL-osoitteeseen tallennettua henkilöä…",
    restoredVerified:
      "URL-osoitteeseen tallennettu rivin sijainti, versio ja UUID vahvistettiin.",
    restored: "Määritetty rivi ladattiin.",
    replayEnriched: "Versio ja UUID lisättiin henkilön linkkiin.",
    replayUnverified:
      "Tämän vastauksen perusteella versiota tai UUID-tunnistetta ei voi vahvistaa.",
    copied: "Näytettävä teksti kopioitiin.",
    promptCopied: "Kehote kopioitiin.",
    urlCopied: "Henkilön linkki kopioitiin.",
    saving: "Tallennetaan nykyinen tulos tiedostoon.",
    conditionsChanged:
      "Valintaehtoja muutettiin. Ne tulevat voimaan seuraavassa valinnassa.",
    dataLanguageChanged:
      "Aineiston kieli vaihdettiin. Muutos tulee voimaan seuraavassa valinnassa.",
    filtersReset: "Seuraavan valinnan suodattimet tyhjennettiin.",
    fields: {
      cultural_background: "Kulttuuri ja kasvuympäristö",
      skills_and_expertise: "Taidot ja asiantuntemus",
      hobbies_and_interests: "Harrastukset ja kiinnostuksenkohteet",
      career_goals_and_ambitions: "Tavoitteet ja pyrkimykset",
      linguistic_background: "Kielellinen tausta",
      linguistic_persona: "Kieliprofiili",
      family_persona: "Perheprofiili",
      age: "Ikä",
      sex: "Sukupuoli",
      occupation: "Ammatti",
      country: "Maa",
      education_level: "Koulutustaso",
      education_degree: "Tutkinto",
      bachelors_field: "Opintoala",
      marital_status: "Siviilisääty",
      prefecture: "Prefektuuri",
      city: "Kaupunki",
      state: "Osavaltio",
      region: "Seutu",
      area: "Alue",
      district: "Piiri",
      province: "Maakunta",
      zone: "Asuinalue",
      municipality: "Kunta",
      commune: "Paikalliskunta",
      departement: "Departementti",
      department: "Departementti",
      planning_area: "Suunnittelualue",
      zipcode: "Postinumero",
      industry: "Toimiala",
      first_language: "Ensimmäinen kieli",
      second_language: "Toinen kieli",
      third_language: "Kolmas kieli",
      languages_spoken: "Puhutut kielet",
      household_type: "Kotitalouden tyyppi",
      family_type: "Perheen tyyppi",
      housing_type: "Asuminen",
      military_status: "Asepalveluksen tila",
    },
    siteTitle: "Satunnaisia kohtaamisia",
  },
  ar: {
    uiLanguage: "لغة الواجهة",
    synthetic: "بيانات شخصيات اصطناعية",
    controls: "الاختيار",
    dataset: "البلد / مجموعة البيانات",
    dataLanguage: "لغة البيانات",
    allCountries: "جميع البلدان",
    defaultLanguages: "اللغة الافتراضية لكل بلد",
    allHint:
      "لكل بلد فرصة متساوية للاختيار. تُستخدم النسختان الإنجليزيتان للهند وبلجيكا.",
    filters: "عوامل التصفية",
    optional: "اختياري",
    sex: "الجنس",
    any: "بلا تحديد",
    female: "أنثى",
    male: "ذكر",
    age: "العمر",
    minAge: "بلا حد أدنى",
    maxAge: "بلا حد أقصى",
    minAgeLabel: "الحد الأدنى للعمر",
    maxAgeLabel: "الحد الأقصى للعمر",
    filterHint:
      "يُفحص ما يصل إلى 300 شخصية عشوائية. أعد المحاولة إذا لم توجد شخصية مطابقة.",
    resetFilters: "مسح عوامل التصفية",
    draw: "اختيار شخصية عشوائية",
    loading: "جارٍ التحميل…",
    cancel: "إلغاء",
    usage: "أمثلة الاستخدام",
    usageIntro:
      "استخدم الخلفية في تعليمات لوكيل ذكاء اصطناعي ليصبح شريكًا في المحادثة بالإنجليزية أو بلغة الشخصية. تتضمن الأمثلة خلفية الشخصية المعروضة تلقائيًا.",
    englishExample: "تعليمات للتدرّب على المحادثة بالإنجليزية",
    localExample: "تعليمات للتدرّب على {language}",
    promptCopy: "نسخ التعليمات",
    promptWaiting: "اختر شخصية لعرض تعليمات تتضمن خلفيتها.",
    background: "الخلفية",
    persona: "الشخصية",
    unknownName: "الاسم غير متاح",
    backgroundText: "نص الخلفية",
    allFields: "جميع الحقول",
    outputFormat: "صيغة الناتج",
    copy: "نسخ",
    save: "حفظ",
    replayUrl: "رابط هذه الشخصية",
    outputPlaceholder: "حمّل شخصية من Hugging Face.",
    outputLabel: "الخلفية المراد نسخها",
    chars: "{count} حرفًا",
    datasetUsed: "مجموعة البيانات المستخدمة",
    sourceWaiting: "ستظهر مجموعة البيانات بعد التحميل.",
    rows: "{count} صفًا",
    unverified: "غير متاح",
    checkLicense: "التحقق من ترخيص مجموعة البيانات",
    manualCopy: "نسخ يدوي",
    manualCopyHint: "لم يسمح المتصفح بالنسخ التلقائي. انسخ النص المحدد يدويًا.",
    selectAll: "تحديد الكل",
    close: "إغلاق",
    noScript: "فعّل JavaScript لاستخدام هذه الأداة.",
    basicInfo: "المعلومات الأساسية",
    personaLabel: "الملف الشخصي",
    rawDataNote: "تُعرض خلفية الشخصية بلغة البيانات الأصلية.",
    promptTemplate:
      "أنا أتعلم {language}. تقمّص الشخصية ذات الخلفية التالية وتدرّب معي على المحادثة بلغة {language}. ابدأ بتعريف موجز عن نفسك، واطرح سؤالًا واحدًا في كل مرة، وانتظر إجابتي. إذا استخدمت تعبيرًا غير طبيعي، فأعد صياغته بإيجاز قبل متابعة المحادثة.\n\nخلفية الشخصية:\n{background}",
    original: "اللغة الأصلية",
    personaLanguage: "اللغة المذكورة في الخلفية",
    uiChanged: "تم تغيير لغة الواجهة.",
    fetching: "جارٍ جلب البيانات من Hugging Face…",
    previousResult: "لا تزال النتيجة السابقة معروضة.",
    cancelled: "تم إلغاء التحميل.",
    fetchFailed: "تعذّر التحميل.",
    searching: "جارٍ البحث عن شخصية مطابقة… {round} / 3",
    drew: "تم اختيار شخصية عشوائية.",
    drewFiltered: "تم الاختيار من بين {count} شخصية عشوائية.",
    partial: "يقتصر الاختيار على البيانات المتاحة عبر واجهة API.",
    revisionMissing: "لا تحدد هذه الاستجابة إصدار البيانات.",
    addressUnavailable: "تعذّر تحديث شريط العنوان. انسخ «رابط هذه الشخصية».",
    restoring: "جارٍ تحميل الشخصية المسجلة في الرابط…",
    restoredVerified:
      "تم التحقق من موضع الصف والإصدار ومعرّف UUID المسجلة في الرابط.",
    restored: "تم تحميل الصف المحدد.",
    replayEnriched: "تمت إضافة الإصدار ومعرّف UUID إلى رابط هذه الشخصية.",
    replayUnverified: "لا تتيح هذه الاستجابة التحقق من الإصدار أو معرّف UUID.",
    copied: "تم نسخ النص المعروض.",
    promptCopied: "تم نسخ التعليمات.",
    urlCopied: "تم نسخ رابط هذه الشخصية.",
    saving: "جارٍ حفظ الناتج الحالي في ملف.",
    conditionsChanged: "تم تغيير شروط الاختيار. ستُطبّق عند الاختيار التالي.",
    dataLanguageChanged: "تم تغيير لغة البيانات. ستُطبّق عند الاختيار التالي.",
    filtersReset: "تم مسح عوامل التصفية للاختيار التالي.",
    fields: {
      cultural_background: "الثقافة والنشأة",
      skills_and_expertise: "المهارات والخبرات",
      hobbies_and_interests: "الهوايات والاهتمامات",
      career_goals_and_ambitions: "الأهداف والطموحات",
      linguistic_background: "الخلفية اللغوية",
      linguistic_persona: "الملف اللغوي",
      family_persona: "الملف العائلي",
      age: "العمر",
      sex: "الجنس",
      occupation: "المهنة",
      country: "البلد",
      education_level: "المستوى التعليمي",
      education_degree: "الشهادة العلمية",
      bachelors_field: "التخصص الدراسي",
      marital_status: "الحالة الاجتماعية",
      prefecture: "المحافظة",
      city: "المدينة",
      state: "الولاية",
      region: "المنطقة",
      area: "النطاق",
      district: "المقاطعة",
      province: "الإقليم",
      zone: "المنطقة السكنية",
      municipality: "البلدية",
      commune: "البلدية المحلية",
      departement: "الإقليم الإداري",
      department: "الإقليم الإداري",
      planning_area: "منطقة التخطيط",
      zipcode: "الرمز البريدي",
      industry: "القطاع",
      first_language: "اللغة الأولى",
      second_language: "اللغة الثانية",
      third_language: "اللغة الثالثة",
      languages_spoken: "اللغات المتحدث بها",
      household_type: "نوع الأسرة المعيشية",
      family_type: "نوع العائلة",
      housing_type: "السكن",
      military_status: "حالة الخدمة العسكرية",
    },
    siteTitle: "لقاءات الصدفة",
  },
  he: {
    uiLanguage: "שפת הממשק",
    synthetic: "נתוני דמויות סינתטיות",
    controls: "בחירה",
    dataset: "מדינה / מערך נתונים",
    dataLanguage: "שפת הנתונים",
    allCountries: "כל המדינות",
    defaultLanguages: "שפת ברירת המחדל לכל מדינה",
    allHint:
      "לכל מדינה סיכוי שווה להיבחר. עבור הודו ובלגיה נעשה שימוש בגרסאות באנגלית.",
    filters: "מסננים",
    optional: "לא חובה",
    sex: "מין",
    any: "ללא הגבלה",
    female: "נקבה",
    male: "זכר",
    age: "גיל",
    minAge: "ללא מינימום",
    maxAge: "ללא מקסימום",
    minAgeLabel: "גיל מינימלי",
    maxAgeLabel: "גיל מקסימלי",
    filterHint: "נבדקות עד 300 דמויות אקראיות. אם לא נמצאה התאמה, נסו שוב.",
    resetFilters: "ניקוי המסננים",
    draw: "בחירת דמות אקראית",
    loading: "בטעינה…",
    cancel: "ביטול",
    usage: "דוגמאות שימוש",
    usageIntro:
      "השתמשו ברקע בתוך הנחיה כדי להפוך סוכן בינה מלאכותית לשותף לשיחה באנגלית או בשפת הדמות. הדוגמאות כוללות אוטומטית את הרקע של הדמות המוצגת.",
    englishExample: "הנחיה לתרגול שיחה באנגלית",
    localExample: "הנחיה לתרגול {language}",
    promptCopy: "העתקת ההנחיה",
    promptWaiting: "בחרו דמות כדי לראות הנחיה הכוללת את הרקע שלה.",
    background: "רקע",
    persona: "דמות",
    unknownName: "השם אינו זמין",
    backgroundText: "טקסט הרקע",
    allFields: "כל השדות",
    outputFormat: "פורמט הפלט",
    copy: "העתקה",
    save: "שמירה",
    replayUrl: "קישור לדמות הזו",
    outputPlaceholder: "טענו דמות מ־Hugging Face.",
    outputLabel: "רקע להעתקה",
    chars: "{count} תווים",
    datasetUsed: "מערך הנתונים שבשימוש",
    sourceWaiting: "מערך הנתונים יוצג לאחר הטעינה.",
    rows: "{count} שורות",
    unverified: "לא זמין",
    checkLicense: "בדיקת רישיון מערך הנתונים",
    manualCopy: "העתקה ידנית",
    manualCopyHint:
      "הדפדפן לא אפשר העתקה אוטומטית. העתיקו את הטקסט המסומן באופן ידני.",
    selectAll: "בחירת הכול",
    close: "סגירה",
    noScript: "יש להפעיל JavaScript כדי להשתמש בכלי הזה.",
    basicInfo: "מידע בסיסי",
    personaLabel: "פרופיל",
    rawDataNote: "הרקע של הדמות מוצג בשפה המקורית של הנתונים.",
    promptTemplate:
      "אני לומד/ת {language}. עליך לגלם את הדמות בעלת הרקע שלהלן ולתרגל איתי שיחה בשפה {language}. יש להתחיל בהצגה עצמית קצרה, לשאול שאלה אחת בכל פעם ולהמתין לתשובתי. אם אשתמש בביטוי שאינו טבעי, יש לנסח אותו מחדש בקצרה לפני המשך השיחה.\n\nרקע הדמות:\n{background}",
    original: "שפת המקור",
    personaLanguage: "השפה המצוינת ברקע",
    uiChanged: "שפת הממשק שונתה.",
    fetching: "הנתונים מתקבלים מ־Hugging Face…",
    previousResult: "התוצאה הקודמת עדיין מוצגת.",
    cancelled: "הטעינה בוטלה.",
    fetchFailed: "הטעינה נכשלה.",
    searching: "בחיפוש אחר דמות מתאימה… {round} / 3",
    drew: "נבחרה דמות אקראית אחת.",
    drewFiltered: "הבחירה נעשתה מתוך {count} דמויות אקראיות.",
    partial: "הבחירה מוגבלת לנתונים הזמינים דרך ה־API.",
    revisionMissing: "התשובה הזו אינה מציינת את גרסת הנתונים.",
    addressUnavailable:
      "לא ניתן לעדכן את שורת הכתובת. העתיקו את ״קישור לדמות הזו״.",
    restoring: "הדמות הרשומה בקישור נטענת…",
    restoredVerified: "אומתו מיקום השורה, הגרסה וה־UUID הרשומים בקישור.",
    restored: "השורה המבוקשת נטענה.",
    replayEnriched: "הגרסה וה־UUID נוספו לקישור של הדמות הזו.",
    replayUnverified: "התשובה הזו אינה מאפשרת לאמת את הגרסה או את ה־UUID.",
    copied: "הטקסט המוצג הועתק.",
    promptCopied: "ההנחיה הועתקה.",
    urlCopied: "הקישור לדמות הזו הועתק.",
    saving: "הפלט הנוכחי נשמר בקובץ.",
    conditionsChanged: "תנאי הבחירה שונו. הם יחולו בבחירה הבאה.",
    dataLanguageChanged: "שפת הנתונים שונתה. השינוי יחול בבחירה הבאה.",
    filtersReset: "המסננים לבחירה הבאה נוקו.",
    fields: {
      cultural_background: "תרבות ורקע ילדות",
      skills_and_expertise: "כישורים ומומחיות",
      hobbies_and_interests: "תחביבים ותחומי עניין",
      career_goals_and_ambitions: "יעדים ושאיפות",
      linguistic_background: "רקע לשוני",
      linguistic_persona: "פרופיל לשוני",
      family_persona: "פרופיל משפחתי",
      age: "גיל",
      sex: "מין",
      occupation: "עיסוק",
      country: "מדינה",
      education_level: "רמת השכלה",
      education_degree: "תואר",
      bachelors_field: "תחום לימודים",
      marital_status: "מצב משפחתי",
      prefecture: "מחוז (פרפקטורה)",
      city: "עיר",
      state: "מדינת משנה",
      region: "אזור",
      area: "סביבה",
      district: "נפה",
      province: "פרובינציה",
      zone: "אזור מגורים",
      municipality: "רשות מקומית",
      commune: "קומונה",
      departement: "מחוז מנהלי",
      department: "מחוז מנהלי",
      planning_area: "אזור תכנון",
      zipcode: "מיקוד",
      industry: "ענף תעסוקה",
      first_language: "שפה ראשונה",
      second_language: "שפה שנייה",
      third_language: "שפה שלישית",
      languages_spoken: "שפות מדוברות",
      household_type: "סוג משק בית",
      family_type: "סוג משפחה",
      housing_type: "דיור",
      military_status: "מעמד בשירות הצבאי",
    },
    siteTitle: "מפגשים מקריים",
  },
  fa: {
    uiLanguage: "زبان رابط",
    synthetic: "داده‌های شخصیت‌های ساختگی",
    controls: "انتخاب",
    dataset: "کشور / مجموعه‌داده",
    dataLanguage: "زبان داده‌ها",
    allCountries: "همهٔ کشورها",
    defaultLanguages: "زبان پیش‌فرض هر کشور",
    allHint:
      "احتمال انتخاب همهٔ کشورها یکسان است. برای هند و بلژیک از نسخه‌های انگلیسی استفاده می‌شود.",
    filters: "فیلترها",
    optional: "اختیاری",
    sex: "جنسیت",
    any: "بدون محدودیت",
    female: "زن",
    male: "مرد",
    age: "سن",
    minAge: "بدون حداقل",
    maxAge: "بدون حداکثر",
    minAgeLabel: "حداقل سن",
    maxAgeLabel: "حداکثر سن",
    filterHint:
      "تا 300 شخصیت تصادفی بررسی می‌شود. اگر موردی پیدا نشد، دوباره امتحان کنید.",
    resetFilters: "پاک کردن فیلترها",
    draw: "انتخاب شخصیت تصادفی",
    loading: "در حال بارگذاری…",
    cancel: "لغو",
    usage: "نمونه‌های کاربرد",
    usageIntro:
      "پیشینه را در یک دستور به کار ببرید تا عامل هوش مصنوعی هم‌صحبت شما برای تمرین انگلیسی یا زبان شخصیت شود. پیشینهٔ شخصیت نمایش‌داده‌شده به‌طور خودکار در نمونه‌ها قرار می‌گیرد.",
    englishExample: "دستور تمرین مکالمهٔ انگلیسی",
    localExample: "دستور تمرین {language}",
    promptCopy: "کپی دستور",
    promptWaiting:
      "یک شخصیت انتخاب کنید تا دستوری شامل پیشینهٔ او نمایش داده شود.",
    background: "پیشینه",
    persona: "شخصیت",
    unknownName: "نام در دسترس نیست",
    backgroundText: "متن پیشینه",
    allFields: "همهٔ فیلدها",
    outputFormat: "قالب خروجی",
    copy: "کپی",
    save: "ذخیره",
    replayUrl: "پیوند این شخصیت",
    outputPlaceholder: "یک شخصیت از Hugging Face بارگذاری کنید.",
    outputLabel: "پیشینه برای کپی",
    chars: "{count} نویسه",
    datasetUsed: "مجموعه‌دادهٔ استفاده‌شده",
    sourceWaiting: "مجموعه‌داده پس از بارگذاری نمایش داده می‌شود.",
    rows: "{count} ردیف",
    unverified: "در دسترس نیست",
    checkLicense: "بررسی مجوز مجموعه‌داده",
    manualCopy: "کپی دستی",
    manualCopyHint:
      "مرورگر اجازهٔ کپی خودکار نداد. متن انتخاب‌شده را دستی کپی کنید.",
    selectAll: "انتخاب همه",
    close: "بستن",
    noScript: "برای استفاده از این ابزار، JavaScript را فعال کنید.",
    basicInfo: "اطلاعات پایه",
    personaLabel: "مشخصات شخصیت",
    rawDataNote: "پیشینهٔ شخصیت به زبان اصلی داده‌ها نمایش داده می‌شود.",
    promptTemplate:
      "من در حال یادگیری {language} هستم. نقش شخصیتی با پیشینهٔ زیر را بازی کن و با من به زبان {language} مکالمه تمرین کن. با معرفی کوتاهی از خودت شروع کن، هر بار فقط یک سؤال بپرس و منتظر پاسخ من بمان. اگر عبارت غیرطبیعی به کار بردم، پیش از ادامهٔ مکالمه آن را به‌اختصار بازنویسی کن.\n\nپیشینهٔ شخصیت:\n{background}",
    original: "زبان اصلی",
    personaLanguage: "زبان ذکرشده در پیشینه",
    uiChanged: "زبان رابط تغییر کرد.",
    fetching: "در حال دریافت از Hugging Face…",
    previousResult: "نتیجهٔ قبلی همچنان نمایش داده می‌شود.",
    cancelled: "بارگذاری لغو شد.",
    fetchFailed: "بارگذاری ناموفق بود.",
    searching: "در حال جست‌وجوی شخصیت مطابق با شرایط… {round} / 3",
    drew: "یک شخصیت تصادفی انتخاب شد.",
    drewFiltered: "انتخاب از میان {count} شخصیت تصادفی انجام شد.",
    partial: "انتخاب به داده‌های قابل دسترسی از طریق API محدود است.",
    revisionMissing: "نسخهٔ داده‌ها در این پاسخ مشخص نشده است.",
    addressUnavailable:
      "نوار نشانی به‌روزرسانی نشد. «پیوند این شخصیت» را کپی کنید.",
    restoring: "در حال بارگذاری شخصیت ثبت‌شده در نشانی…",
    restoredVerified: "موقعیت ردیف، نسخه و UUID ثبت‌شده در نشانی تأیید شدند.",
    restored: "ردیف مشخص‌شده بارگذاری شد.",
    replayEnriched: "نسخه و UUID به پیوند این شخصیت افزوده شدند.",
    replayUnverified: "این پاسخ امکان تأیید نسخه یا UUID را نمی‌دهد.",
    copied: "متن نمایش‌داده‌شده کپی شد.",
    promptCopied: "دستور کپی شد.",
    urlCopied: "پیوند این شخصیت کپی شد.",
    saving: "در حال ذخیرهٔ خروجی فعلی در فایل.",
    conditionsChanged:
      "شرایط انتخاب تغییر کرد. این شرایط در انتخاب بعدی اعمال می‌شود.",
    dataLanguageChanged:
      "زبان داده‌ها تغییر کرد. این تغییر در انتخاب بعدی اعمال می‌شود.",
    filtersReset: "فیلترهای انتخاب بعدی پاک شدند.",
    fields: {
      cultural_background: "فرهنگ و دوران رشد",
      skills_and_expertise: "مهارت‌ها و تخصص",
      hobbies_and_interests: "سرگرمی‌ها و علایق",
      career_goals_and_ambitions: "اهداف و آرزوها",
      linguistic_background: "پیشینهٔ زبانی",
      linguistic_persona: "مشخصات زبانی",
      family_persona: "مشخصات خانوادگی",
      age: "سن",
      sex: "جنسیت",
      occupation: "شغل",
      country: "کشور",
      education_level: "سطح تحصیلات",
      education_degree: "مدرک تحصیلی",
      bachelors_field: "رشتهٔ تحصیلی",
      marital_status: "وضعیت تأهل",
      prefecture: "استان (پرفکتور)",
      city: "شهر",
      state: "ایالت",
      region: "منطقه",
      area: "ناحیه",
      district: "بخش",
      province: "استان",
      zone: "محدودهٔ مسکونی",
      municipality: "شهرداری",
      commune: "کمون",
      departement: "بخش اداری",
      department: "بخش اداری",
      planning_area: "ناحیهٔ برنامه‌ریزی",
      zipcode: "کد پستی",
      industry: "صنعت",
      first_language: "زبان اول",
      second_language: "زبان دوم",
      third_language: "زبان سوم",
      languages_spoken: "زبان‌های گفتاری",
      household_type: "نوع خانوار",
      family_type: "نوع خانواده",
      housing_type: "مسکن",
      military_status: "وضعیت خدمت سربازی",
    },
    siteTitle: "دیدارهای اتفاقی",
  },
  ur: {
    uiLanguage: "انٹرفیس کی زبان",
    synthetic: "مصنوعی شخصیات کا ڈیٹا",
    controls: "انتخاب",
    dataset: "ملک / ڈیٹا سیٹ",
    dataLanguage: "ڈیٹا کی زبان",
    allCountries: "تمام ممالک",
    defaultLanguages: "ہر ملک کی طے شدہ زبان",
    allHint:
      "ہر ملک کے منتخب ہونے کا امکان برابر ہے۔ بھارت اور بیلجیئم کے لیے انگریزی نسخے استعمال ہوتے ہیں۔",
    filters: "فلٹرز",
    optional: "اختیاری",
    sex: "جنس",
    any: "کوئی بھی",
    female: "عورت",
    male: "مرد",
    age: "عمر",
    minAge: "کم از کم حد نہیں",
    maxAge: "زیادہ سے زیادہ حد نہیں",
    minAgeLabel: "کم از کم عمر",
    maxAgeLabel: "زیادہ سے زیادہ عمر",
    filterHint:
      "زیادہ سے زیادہ 300 تصادفی شخصیات جانچی جاتی ہیں۔ کوئی موزوں شخصیت نہ ملے تو دوبارہ کوشش کریں۔",
    resetFilters: "فلٹرز صاف کریں",
    draw: "تصادفی شخصیت منتخب کریں",
    loading: "لوڈ ہو رہا ہے…",
    cancel: "منسوخ کریں",
    usage: "استعمال کی مثالیں",
    usageIntro:
      "پس منظر کو ہدایات میں شامل کر کے AI ایجنٹ کو انگریزی یا شخصیت کی زبان میں گفتگو کی مشق کا ساتھی بنائیں۔ مثالوں میں دکھائی گئی شخصیت کا پس منظر خود بخود شامل ہو جاتا ہے۔",
    englishExample: "انگریزی گفتگو کی مشق کی ہدایات",
    localExample: "{language} کی مشق کی ہدایات",
    promptCopy: "ہدایات کاپی کریں",
    promptWaiting:
      "پس منظر پر مشتمل ہدایات دیکھنے کے لیے ایک شخصیت منتخب کریں۔",
    background: "پس منظر",
    persona: "شخصیت",
    unknownName: "نام دستیاب نہیں",
    backgroundText: "پس منظر کا متن",
    allFields: "تمام خانے",
    outputFormat: "آؤٹ پٹ کی شکل",
    copy: "کاپی کریں",
    save: "محفوظ کریں",
    replayUrl: "اس شخصیت کا ربط",
    outputPlaceholder: "Hugging Face سے ایک شخصیت لوڈ کریں۔",
    outputLabel: "کاپی کرنے کے لیے پس منظر",
    chars: "{count} حروف",
    datasetUsed: "استعمال شدہ ڈیٹا سیٹ",
    sourceWaiting: "لوڈ ہونے کے بعد ڈیٹا سیٹ دکھایا جائے گا۔",
    rows: "{count} قطاریں",
    unverified: "دستیاب نہیں",
    checkLicense: "ڈیٹا سیٹ کا لائسنس دیکھیں",
    manualCopy: "دستی طور پر کاپی کریں",
    manualCopyHint:
      "براؤزر نے خودکار کاپی کی اجازت نہیں دی۔ منتخب متن دستی طور پر کاپی کریں۔",
    selectAll: "سب منتخب کریں",
    close: "بند کریں",
    noScript: "یہ ٹول استعمال کرنے کے لیے JavaScript فعال کریں۔",
    basicInfo: "بنیادی معلومات",
    personaLabel: "تعارف",
    rawDataNote: "شخصیت کا پس منظر ڈیٹا کی اصل زبان میں دکھایا جاتا ہے۔",
    promptTemplate:
      "میں {language} سیکھ رہا/رہی ہوں۔ ذیل کے پس منظر والی شخصیت کا کردار ادا کریں اور میرے ساتھ {language} میں گفتگو کی مشق کریں۔ مختصر تعارف سے آغاز کریں، ایک وقت میں ایک سوال پوچھیں اور میرے جواب کا انتظار کریں۔ اگر میں کوئی غیر فطری عبارت استعمال کروں تو گفتگو جاری رکھنے سے پہلے اسے مختصراً بہتر انداز میں بیان کریں۔\n\nشخصیت کا پس منظر:\n{background}",
    original: "اصل زبان",
    personaLanguage: "پس منظر میں درج زبان",
    uiChanged: "انٹرفیس کی زبان بدل دی گئی۔",
    fetching: "Hugging Face سے ڈیٹا حاصل کیا جا رہا ہے…",
    previousResult: "پچھلا نتیجہ اب بھی دکھایا جا رہا ہے۔",
    cancelled: "لوڈ کرنا منسوخ کر دیا گیا۔",
    fetchFailed: "لوڈ نہیں ہو سکا۔",
    searching: "شرائط کے مطابق شخصیت تلاش کی جا رہی ہے… {round} / 3",
    drew: "ایک تصادفی شخصیت منتخب کی گئی۔",
    drewFiltered: "{count} تصادفی شخصیات میں سے انتخاب کیا گیا۔",
    partial: "انتخاب صرف API کے ذریعے دستیاب ڈیٹا تک محدود ہے۔",
    revisionMissing: "اس جواب میں ڈیٹا کا نسخہ درج نہیں ہے۔",
    addressUnavailable:
      "ایڈریس بار اپ ڈیٹ نہیں ہو سکی۔ «اس شخصیت کا ربط» کاپی کریں۔",
    restoring: "ربط میں درج شخصیت لوڈ ہو رہی ہے…",
    restoredVerified: "ربط میں درج قطار کی جگہ، نسخے اور UUID کی تصدیق ہو گئی۔",
    restored: "مخصوص قطار لوڈ ہو گئی۔",
    replayEnriched: "اس شخصیت کے ربط میں نسخہ اور UUID شامل کر دیے گئے۔",
    replayUnverified: "اس جواب سے نسخے یا UUID کی تصدیق نہیں ہو سکتی۔",
    copied: "دکھایا گیا متن کاپی ہو گیا۔",
    promptCopied: "ہدایات کاپی ہو گئیں۔",
    urlCopied: "اس شخصیت کا ربط کاپی ہو گیا۔",
    saving: "موجودہ آؤٹ پٹ فائل میں محفوظ کیا جا رہا ہے۔",
    conditionsChanged:
      "انتخاب کی شرائط بدل دی گئیں۔ یہ اگلے انتخاب پر لاگو ہوں گی۔",
    dataLanguageChanged:
      "ڈیٹا کی زبان بدل دی گئی۔ یہ اگلے انتخاب پر لاگو ہوگی۔",
    filtersReset: "اگلے انتخاب کے فلٹرز صاف کر دیے گئے۔",
    fields: {
      cultural_background: "ثقافت اور پرورش",
      skills_and_expertise: "ہنر اور مہارت",
      hobbies_and_interests: "مشاغل اور دلچسپیاں",
      career_goals_and_ambitions: "اہداف اور عزائم",
      linguistic_background: "لسانی پس منظر",
      linguistic_persona: "لسانی تعارف",
      family_persona: "خاندانی تعارف",
      age: "عمر",
      sex: "جنس",
      occupation: "پیشہ",
      country: "ملک",
      education_level: "تعلیمی سطح",
      education_degree: "تعلیمی سند",
      bachelors_field: "تعلیم کا شعبہ",
      marital_status: "ازدواجی حیثیت",
      prefecture: "پریفیکچر",
      city: "شہر",
      state: "ریاست",
      region: "خطہ",
      area: "علاقہ",
      district: "ضلع",
      province: "صوبہ",
      zone: "رہائشی علاقہ",
      municipality: "بلدیہ",
      commune: "کمیون",
      departement: "انتظامی خطہ",
      department: "انتظامی خطہ",
      planning_area: "منصوبہ بندی کا علاقہ",
      zipcode: "پوسٹل کوڈ",
      industry: "صنعت",
      first_language: "پہلی زبان",
      second_language: "دوسری زبان",
      third_language: "تیسری زبان",
      languages_spoken: "بولی جانے والی زبانیں",
      household_type: "گھرانے کی قسم",
      family_type: "خاندان کی قسم",
      housing_type: "رہائش",
      military_status: "فوجی خدمت کی حیثیت",
    },
    siteTitle: "اتفاقی ملاقاتیں",
  },
  sw: {
    uiLanguage: "Lugha ya kiolesura",
    synthetic: "Data za wahusika waliobuniwa",
    controls: "Uchaguzi",
    dataset: "Nchi / seti ya data",
    dataLanguage: "Lugha ya data",
    allCountries: "Nchi zote",
    defaultLanguages: "Lugha chaguomsingi ya kila nchi",
    allHint:
      "Kila nchi ina nafasi sawa ya kuchaguliwa. Matoleo ya Kiingereza hutumika kwa India na Ubelgiji.",
    filters: "Vichujio",
    optional: "Si lazima",
    sex: "Jinsia",
    any: "Yoyote",
    female: "Mwanamke",
    male: "Mwanamume",
    age: "Umri",
    minAge: "Bila kikomo cha chini",
    maxAge: "Bila kikomo cha juu",
    minAgeLabel: "Umri wa chini",
    maxAgeLabel: "Umri wa juu",
    filterHint:
      "Hukagua hadi wahusika 300 waliochaguliwa kwa nasibu. Jaribu tena ikiwa hakuna anayefaa.",
    resetFilters: "Futa vichujio",
    draw: "Chagua mhusika kwa nasibu",
    loading: "Inapakia…",
    cancel: "Ghairi",
    usage: "Mifano ya matumizi",
    usageIntro:
      "Tumia historia katika maelekezo ili kufanya wakala wa akili bandia awe mwenzi wa mazungumzo kwa Kiingereza au lugha ya mhusika. Mifano hujumuisha moja kwa moja historia ya mhusika anayeonyeshwa.",
    englishExample: "Maelekezo ya mazungumzo ya Kiingereza",
    localExample: "Maelekezo ya kufanya mazoezi ya {language}",
    promptCopy: "Nakili maelekezo",
    promptWaiting: "Chagua mhusika ili kuona maelekezo yenye historia yake.",
    background: "Historia ya mhusika",
    persona: "Mhusika",
    unknownName: "Jina halipatikani",
    backgroundText: "Maandishi ya historia",
    allFields: "Sehemu zote",
    outputFormat: "Muundo wa matokeo",
    copy: "Nakili",
    save: "Hifadhi",
    replayUrl: "Kiungo cha mhusika huyu",
    outputPlaceholder: "Pakia mhusika kutoka Hugging Face.",
    outputLabel: "Historia ya kunakili",
    chars: "Herufi {count}",
    datasetUsed: "Seti ya data iliyotumika",
    sourceWaiting: "Seti ya data itaonekana baada ya kupakiwa.",
    rows: "Safu mlalo {count}",
    unverified: "Haipatikani",
    checkLicense: "Angalia leseni ya seti ya data",
    manualCopy: "Nakili mwenyewe",
    manualCopyHint:
      "Kivinjari hakikuruhusu kunakili kiotomatiki. Nakili maandishi yaliyochaguliwa mwenyewe.",
    selectAll: "Chagua yote",
    close: "Funga",
    noScript: "Washa JavaScript ili kutumia zana hii.",
    basicInfo: "Taarifa za msingi",
    personaLabel: "Wasifu",
    rawDataNote: "Historia ya mhusika inaonyeshwa katika lugha asili ya data.",
    promptTemplate:
      "Ninajifunza {language}. Igiza mhusika mwenye historia iliyo hapa chini na ufanye mazoezi ya mazungumzo nami kwa {language}. Anza kwa kujitambulisha kwa kifupi, uliza swali moja kwa wakati, kisha subiri jibu langu. Nikitumia usemi usio wa kawaida, urekebishe kwa kifupi kabla ya kuendelea na mazungumzo.\n\nHistoria ya mhusika:\n{background}",
    original: "Lugha asili",
    personaLanguage: "Lugha iliyotajwa katika historia",
    uiChanged: "Lugha ya kiolesura imebadilishwa.",
    fetching: "Inapata data kutoka Hugging Face…",
    previousResult: "Matokeo ya awali bado yanaonyeshwa.",
    cancelled: "Upakiaji umeghairiwa.",
    fetchFailed: "Upakiaji umeshindikana.",
    searching: "Inatafuta mhusika anayefaa… {round} / 3",
    drew: "Mhusika mmoja amechaguliwa kwa nasibu.",
    drewFiltered:
      "Mhusika amechaguliwa kutoka kwa wahusika {count} waliopatikana kwa nasibu.",
    partial: "Uchaguzi unahusu tu data inayopatikana kupitia API.",
    revisionMissing: "Jibu hili halibainishi toleo la data.",
    addressUnavailable:
      "Upau wa anwani haukuweza kusasishwa. Nakili “Kiungo cha mhusika huyu”.",
    restoring: "Inapakia mhusika aliyerekodiwa kwenye kiungo…",
    restoredVerified:
      "Nafasi ya safu mlalo, toleo na UUID zilizorekodiwa kwenye kiungo zimethibitishwa.",
    restored: "Safu mlalo iliyobainishwa imepakiwa.",
    replayEnriched: "Toleo na UUID zimeongezwa kwenye kiungo cha mhusika huyu.",
    replayUnverified: "Jibu hili haliruhusu kuthibitisha toleo au UUID.",
    copied: "Maandishi yanayoonyeshwa yamenakiliwa.",
    promptCopied: "Maelekezo yamenakiliwa.",
    urlCopied: "Kiungo cha mhusika huyu kimenakiliwa.",
    saving: "Inahifadhi matokeo ya sasa kwenye faili.",
    conditionsChanged:
      "Masharti ya uchaguzi yamebadilishwa. Yatatumika katika uchaguzi unaofuata.",
    dataLanguageChanged:
      "Lugha ya data imebadilishwa. Itatumika katika uchaguzi unaofuata.",
    filtersReset: "Vichujio vya uchaguzi unaofuata vimefutwa.",
    fields: {
      cultural_background: "Utamaduni na malezi",
      skills_and_expertise: "Ujuzi na utaalamu",
      hobbies_and_interests: "Shughuli za burudani na mapendeleo",
      career_goals_and_ambitions: "Malengo na matarajio",
      linguistic_background: "Historia ya lugha",
      linguistic_persona: "Wasifu wa lugha",
      family_persona: "Wasifu wa familia",
      age: "Umri",
      sex: "Jinsia",
      occupation: "Kazi",
      country: "Nchi",
      education_level: "Kiwango cha elimu",
      education_degree: "Shahada",
      bachelors_field: "Fani ya masomo",
      marital_status: "Hali ya ndoa",
      prefecture: "Mkoa wa kiutawala",
      city: "Jiji",
      state: "Jimbo",
      region: "Mkoa",
      area: "Eneo",
      district: "Wilaya",
      province: "Jimbo la kiutawala",
      zone: "Ukanda wa makazi",
      municipality: "Manispaa",
      commune: "Halmashauri ya eneo",
      departement: "Kitengo cha kiutawala",
      department: "Kitengo cha kiutawala",
      planning_area: "Eneo la upangaji",
      zipcode: "Msimbo wa posta",
      industry: "Sekta",
      first_language: "Lugha ya kwanza",
      second_language: "Lugha ya pili",
      third_language: "Lugha ya tatu",
      languages_spoken: "Lugha zinazozungumzwa",
      household_type: "Aina ya kaya",
      family_type: "Aina ya familia",
      housing_type: "Makazi",
      military_status: "Hali ya huduma ya kijeshi",
    },
    siteTitle: "Kukutana kwa bahati",
  },
};
const ERRORS = {
  ja: {
    invalidCount: "抽出可能な行数が不正です。",
    invalidDataset:
      "NVIDIA Nemotron Personas のデータセットを指定してください。",
    rateLimited:
      "Hugging Face の利用制限に達しました。少し待って再実行してください。",
    httpError:
      "Hugging Faceから取得できませんでした（HTTP {status}）。再実行するか、別の国を選んでください。",
    invalidResponse: "API の応答を読み取れませんでした。再実行してください。",
    timedOut: "Hugging Face の応答がタイムアウトしました。再実行してください。",
    connectionFailed:
      "API に接続できません。インターネット接続とブラウザの通信制限を確認してください。",
    noData:
      "取得できるデータがありません。データセットの公開状態を確認してください。",
    rowMissing:
      "指定した位置にデータがありません。データセットが更新された可能性があります。",
    invalidRow: "行データの形式が想定と異なります。",
    invalidAge: "年齢は 0〜130 の整数で指定してください。",
    invalidAgeRange: "年齢の下限は、上限以下にしてください。",
    invalidSex: "性別の指定が不正です。",
    revisionChangedDuringDraw:
      "取得中にデータセットの版が変わりました。もう一度抽出してください。",
    noMatch:
      "今回調べた候補{count}件には、条件に合う人物が見つかりませんでした。条件を緩めるか、再抽出してください。",
    truncatedDraw:
      "この行の内容は API で省略されています。別の人物を抽出してください。",
    splitsChanged:
      "言語の構成が変更されました。選択し直して再抽出してください。",
    invalidURL: "URL または ? で始まるクエリパラメータを入力してください。",
    invalidReplayDataset: "再現用 URL の dataset が不正です。",
    invalidOffset: "再現用 URL の offset は 0 以上の整数で指定してください。",
    invalidSplit: "config または split が不正です。",
    invalidRevision: "再現用 URL の rev が不正です。",
    invalidUUID: "再現用 URL の uuid が不正です。",
    invalidView: "再現用 URL の表示形式が不正です。",
    replaySplitMissing:
      "URL に記録された config / split が現在のデータセットにありません。",
    offsetOutOfRange: "offsetが範囲外です。現在の有効範囲は0〜{max}です。",
    wrongRow: "API が指定した位置と異なる行を返しました。復元を中止しました。",
    replayRevisionMismatch:
      "データセットの版が URL の記録と異なります。同じ内容を保証できないため復元を中止しました。保存済みのテキスト・JSON を使用してください。",
    replayRevisionMissing:
      "API からデータの版を確認できないため、復元を中止しました。",
    replayUUIDMismatch:
      "人物の UUID が URL の記録と異なります。別の人物を表示しないため、復元を中止しました。",
    truncatedReplay:
      "この行の内容は API で省略されています。復元を中止しました。",
  },
  en: {
    invalidCount: "The available row count is invalid.",
    invalidDataset: "Select an NVIDIA Nemotron Personas dataset.",
    rateLimited:
      "Hugging Face has rate-limited the request. Wait a moment and try again.",
    httpError:
      "Could not fetch from Hugging Face (HTTP {status}). Try again or select another country.",
    invalidResponse: "The API response could not be read. Try again.",
    timedOut: "Hugging Face did not respond in time. Try again.",
    connectionFailed:
      "Could not connect to the API. Check your internet connection and browser network restrictions.",
    noData:
      "No data is available. Check whether the dataset is publicly accessible.",
    rowMissing:
      "There is no data at that offset. The dataset may have been updated.",
    invalidRow: "The row data has an unexpected format.",
    invalidAge: "Enter an age as a whole number from 0 to 130.",
    invalidAgeRange: "The minimum age must not exceed the maximum age.",
    invalidSex: "The sex filter value is invalid.",
    revisionChangedDuringDraw:
      "The dataset revision changed during the request. Draw again.",
    noMatch:
      "No matching persona was found among the {count} candidates checked. Broaden the filters or draw again.",
    truncatedDraw: "The API truncated this row. Draw another persona.",
    splitsChanged:
      "The available data languages have changed. Select a language and draw again.",
    invalidURL: "The replay URL or query string is invalid.",
    invalidReplayDataset: "The dataset in the replay URL is invalid.",
    invalidOffset: "The replay offset must be a nonnegative whole number.",
    invalidSplit: "The config or split is invalid.",
    invalidRevision: "The rev value in the replay URL is invalid.",
    invalidUUID: "The UUID in the replay URL is invalid.",
    invalidView: "The output format in the replay URL is invalid.",
    replaySplitMissing:
      "The config / split in the URL is no longer available in this dataset.",
    offsetOutOfRange:
      "The offset is out of range. The current range is 0 to {max}.",
    wrongRow: "The API returned a different row offset. Replay was stopped.",
    replayRevisionMismatch:
      "The dataset revision differs from the URL. Replay was stopped because the content may have changed. Use a saved text or JSON file.",
    replayRevisionMissing:
      "The API did not provide a dataset revision. Replay was stopped.",
    replayUUIDMismatch:
      "The persona UUID differs from the URL. Replay was stopped to avoid displaying a different persona.",
    truncatedReplay: "The API truncated this row. Replay was stopped.",
  },
  zh: {
    invalidCount: "可用的数据行数无效。",
    invalidDataset: "请选择NVIDIA Nemotron Personas数据集。",
    rateLimited: "请求已达到Hugging Face的频率限制。请稍后重试。",
    httpError:
      "无法从Hugging Face获取数据（HTTP {status}）。请重试或选择其他国家。",
    invalidResponse: "无法读取API响应，请重试。",
    timedOut: "Hugging Face响应超时，请重试。",
    connectionFailed: "无法连接API。请检查网络连接和浏览器的网络限制。",
    noData: "没有可获取的数据。请确认数据集是否公开可访问。",
    rowMissing: "指定位置没有数据，数据集可能已更新。",
    invalidRow: "数据行的格式与预期不符。",
    invalidAge: "请输入0至130之间的整数年龄。",
    invalidAgeRange: "最低年龄不能超过最高年龄。",
    invalidSex: "性别筛选值无效。",
    revisionChangedDuringDraw: "获取过程中数据集的版本发生了变化。请重新抽取。",
    noMatch:
      "本次检查的{count}个候选人物均不符合条件。请放宽筛选条件或重新抽取。",
    truncatedDraw: "API截断了此行的内容。请抽取其他人物。",
    splitsChanged: "可用的数据语言已发生变化。请重新选择语言并抽取。",
    invalidURL: "人物链接或查询参数无效。",
    invalidReplayDataset: "人物链接中的dataset无效。",
    invalidOffset: "人物链接中的offset必须为非负整数。",
    invalidSplit: "config或split无效。",
    invalidRevision: "人物链接中的rev无效。",
    invalidUUID: "人物链接中的uuid无效。",
    invalidView: "人物链接中的输出格式无效。",
    replaySplitMissing: "当前数据集中已不存在URL所记录的config或split。",
    offsetOutOfRange: "offset超出范围。当前有效范围为0至{max}。",
    wrongRow: "API返回的数据行位置与指定位置不符，已停止重新显示。",
    replayRevisionMismatch:
      "数据集版本与URL中的记录不同。由于内容可能已变化，已停止重新显示。请使用之前保存的文本或JSON文件。",
    replayRevisionMissing: "API未提供可确认的数据集版本，已停止重新显示。",
    replayUUIDMismatch:
      "人物的UUID与URL中的记录不同。为避免显示其他人物，已停止重新显示。",
    truncatedReplay: "API截断了此行的内容，已停止重新显示。",
  },
  ko: {
    invalidCount: "이용 가능한 행 수가 올바르지 않습니다.",
    invalidDataset: "NVIDIA Nemotron Personas 데이터셋을 선택하세요.",
    rateLimited:
      "Hugging Face의 요청 횟수 제한에 도달했습니다. 잠시 기다린 후 다시 시도하세요.",
    httpError:
      "Hugging Face에서 데이터를 가져오지 못했습니다(HTTP {status}). 다시 시도하거나 다른 국가를 선택하세요.",
    invalidResponse: "API 응답을 읽을 수 없습니다. 다시 시도하세요.",
    timedOut:
      "Hugging Face가 제한 시간 내에 응답하지 않았습니다. 다시 시도하세요.",
    connectionFailed:
      "API에 연결할 수 없습니다. 인터넷 연결과 브라우저의 네트워크 제한을 확인하세요.",
    noData:
      "이용 가능한 데이터가 없습니다. 데이터셋이 공개되어 있는지 확인하세요.",
    rowMissing:
      "해당 오프셋에 데이터가 없습니다. 데이터셋이 갱신되었을 수 있습니다.",
    invalidRow: "행 데이터의 형식이 예상과 다릅니다.",
    invalidAge: "나이는 0부터 130까지의 정수로 입력하세요.",
    invalidAgeRange: "최소 나이는 최대 나이를 초과할 수 없습니다.",
    invalidSex: "성별 필터 값이 올바르지 않습니다.",
    revisionChangedDuringDraw:
      "요청 중 데이터셋 버전이 변경되었습니다. 다시 선택하세요.",
    noMatch:
      "확인한 후보 {count}명 중 조건에 맞는 인물이 없습니다. 필터를 완화하거나 다시 선택하세요.",
    truncatedDraw:
      "API가 이 행의 내용을 일부 생략했습니다. 다른 인물을 선택하세요.",
    splitsChanged:
      "이용 가능한 데이터 언어가 변경되었습니다. 언어를 선택한 후 다시 추출하세요.",
    invalidURL: "재현용 URL 또는 쿼리 문자열이 올바르지 않습니다.",
    invalidReplayDataset: "재현용 URL의 데이터셋이 올바르지 않습니다.",
    invalidOffset: "재현할 오프셋은 0 이상의 정수여야 합니다.",
    invalidSplit: "구성 또는 데이터 분할이 올바르지 않습니다.",
    invalidRevision: "재현용 URL의 rev 값이 올바르지 않습니다.",
    invalidUUID: "재현용 URL의 UUID가 올바르지 않습니다.",
    invalidView: "재현용 URL의 출력 형식이 올바르지 않습니다.",
    replaySplitMissing:
      "URL에 기록된 구성 / 데이터 분할을 현재 데이터셋에서 이용할 수 없습니다.",
    offsetOutOfRange:
      "오프셋이 범위를 벗어났습니다. 현재 범위는 0부터 {max}까지입니다.",
    wrongRow: "API가 다른 행 오프셋을 반환했습니다. 재현을 중단했습니다.",
    replayRevisionMismatch:
      "데이터셋 버전이 URL의 기록과 다릅니다. 내용이 변경되었을 수 있어 재현을 중단했습니다. 저장한 텍스트나 JSON 파일을 사용하세요.",
    replayRevisionMissing:
      "API가 데이터셋 버전을 제공하지 않았습니다. 재현을 중단했습니다.",
    replayUUIDMismatch:
      "인물의 UUID가 URL의 기록과 다릅니다. 다른 인물이 표시되지 않도록 재현을 중단했습니다.",
    truncatedReplay:
      "API가 이 행의 내용을 일부 생략했습니다. 재현을 중단했습니다.",
  },
  hi: {
    invalidCount: "उपलब्ध पंक्तियों की संख्या अमान्य है।",
    invalidDataset: "NVIDIA Nemotron Personas का कोई डेटासेट चुनें।",
    rateLimited:
      "Hugging Face ने अनुरोधों की दर सीमित कर दी है। कुछ देर रुककर फिर कोशिश करें।",
    httpError:
      "Hugging Face से डेटा नहीं लाया जा सका (HTTP {status})। फिर कोशिश करें या कोई दूसरा देश चुनें।",
    invalidResponse: "API का जवाब पढ़ा नहीं जा सका। फिर कोशिश करें।",
    timedOut: "Hugging Face ने समय पर जवाब नहीं दिया। फिर कोशिश करें।",
    connectionFailed:
      "API से संपर्क नहीं हो सका। अपना इंटरनेट कनेक्शन और ब्राउज़र की नेटवर्क पाबंदियाँ जाँचें।",
    noData:
      "कोई डेटा उपलब्ध नहीं है। जाँचें कि डेटासेट सार्वजनिक रूप से उपलब्ध है या नहीं।",
    rowMissing: "उस ऑफ़सेट पर कोई डेटा नहीं है। डेटासेट अपडेट हुआ हो सकता है।",
    invalidRow: "पंक्ति के डेटा का प्रारूप अपेक्षा से अलग है।",
    invalidAge: "उम्र 0 से 130 के बीच पूर्णांक में दर्ज करें।",
    invalidAgeRange: "न्यूनतम उम्र अधिकतम उम्र से ज़्यादा नहीं होनी चाहिए।",
    invalidSex: "लिंग फ़िल्टर का मान अमान्य है।",
    revisionChangedDuringDraw:
      "अनुरोध के दौरान डेटासेट का संशोधन बदल गया। फिर से यादृच्छिक चयन करें।",
    noMatch:
      "जाँचे गए {count} व्यक्तियों में कोई शर्तों से मेल नहीं खाता। फ़िल्टर कम करें या फिर से यादृच्छिक चयन करें।",
    truncatedDraw:
      "API ने इस पंक्ति का डेटा अधूरा दिया है। कोई दूसरा व्यक्ति चुनें।",
    splitsChanged:
      "डेटा की उपलब्ध भाषाएँ बदल गई हैं। कोई भाषा चुनें और फिर से यादृच्छिक चयन करें।",
    invalidURL:
      "व्यक्ति को दोबारा दिखाने वाला URL या क्वेरी स्ट्रिंग अमान्य है।",
    invalidReplayDataset: "दोबारा दिखाने वाले URL में डेटासेट अमान्य है।",
    invalidOffset:
      "दोबारा दिखाने के लिए ऑफ़सेट शून्य या उससे बड़ा पूर्णांक होना चाहिए।",
    invalidSplit: "कॉन्फ़िगरेशन या विभाजन अमान्य है।",
    invalidRevision: "दोबारा दिखाने वाले URL में rev का मान अमान्य है।",
    invalidUUID: "दोबारा दिखाने वाले URL में UUID अमान्य है।",
    invalidView: "दोबारा दिखाने वाले URL में आउटपुट का प्रारूप अमान्य है।",
    replaySplitMissing:
      "URL में दिया कॉन्फ़िगरेशन / विभाजन अब इस डेटासेट में उपलब्ध नहीं है।",
    offsetOutOfRange: "ऑफ़सेट सीमा से बाहर है। मौजूदा सीमा 0 से {max} है।",
    wrongRow: "API ने पंक्ति का अलग ऑफ़सेट लौटाया। दोबारा दिखाना रोक दिया गया।",
    replayRevisionMismatch:
      "डेटासेट का संशोधन URL से अलग है। सामग्री बदल गई हो सकती है, इसलिए दोबारा दिखाना रोक दिया गया। सहेजी हुई पाठ या JSON फ़ाइल इस्तेमाल करें।",
    replayRevisionMissing:
      "API ने डेटासेट के संशोधन की जानकारी नहीं दी। दोबारा दिखाना रोक दिया गया।",
    replayUUIDMismatch:
      "व्यक्ति का UUID URL से अलग है। किसी दूसरे व्यक्ति को दिखाने से बचने के लिए दोबारा दिखाना रोक दिया गया।",
    truncatedReplay:
      "API ने इस पंक्ति का डेटा अधूरा दिया है। दोबारा दिखाना रोक दिया गया।",
  },
  bn: {
    invalidCount: "প্রাপ্য সারির সংখ্যা অবৈধ।",
    invalidDataset: "NVIDIA Nemotron Personas-এর একটি ডেটাসেট বেছে নিন।",
    rateLimited:
      "Hugging Face অনুরোধের হার সীমিত করেছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।",
    httpError:
      "Hugging Face থেকে তথ্য আনা যায়নি (HTTP {status})। আবার চেষ্টা করুন বা অন্য দেশ বেছে নিন।",
    invalidResponse: "API-এর উত্তর পড়া যায়নি। আবার চেষ্টা করুন।",
    timedOut: "Hugging Face সময়মতো উত্তর দেয়নি। আবার চেষ্টা করুন।",
    connectionFailed:
      "API-এর সঙ্গে সংযোগ করা যায়নি। ইন্টারনেট সংযোগ ও ব্রাউজারের নেটওয়ার্ক বিধিনিষেধ পরীক্ষা করুন।",
    noData:
      "কোনো তথ্য পাওয়া যাচ্ছে না। ডেটাসেটটি সবার জন্য উন্মুক্ত কি না দেখুন।",
    rowMissing: "ওই অফসেটে কোনো তথ্য নেই। ডেটাসেট হালনাগাদ হয়ে থাকতে পারে।",
    invalidRow: "সারির তথ্যের বিন্যাস প্রত্যাশিত নয়।",
    invalidAge: "বয়স ০ থেকে ১৩০-এর মধ্যে পূর্ণসংখ্যায় লিখুন।",
    invalidAgeRange: "ন্যূনতম বয়স সর্বোচ্চ বয়সের চেয়ে বেশি হতে পারবে না।",
    invalidSex: "লিঙ্গ ফিল্টারের মান অবৈধ।",
    revisionChangedDuringDraw:
      "অনুরোধ চলাকালে ডেটাসেটের সংস্করণ বদলে গেছে। আবার এলোমেলো নির্বাচন করুন।",
    noMatch:
      "যাচাই করা {count} জনের মধ্যে শর্তের সঙ্গে মেলে এমন কাউকে পাওয়া যায়নি। ফিল্টার শিথিল করুন বা আবার এলোমেলো নির্বাচন করুন।",
    truncatedDraw: "API এই সারির তথ্য অসম্পূর্ণ দিয়েছে। অন্য কাউকে বেছে নিন।",
    splitsChanged:
      "তথ্যের প্রাপ্য ভাষাগুলো বদলে গেছে। ভাষা বেছে নিয়ে আবার এলোমেলো নির্বাচন করুন।",
    invalidURL: "আবার দেখানোর URL বা কোয়েরি স্ট্রিং অবৈধ।",
    invalidReplayDataset: "আবার দেখানোর URL-এর ডেটাসেট অবৈধ।",
    invalidOffset:
      "আবার দেখানোর অফসেট শূন্য বা তার চেয়ে বড় পূর্ণসংখ্যা হতে হবে।",
    invalidSplit: "কনফিগারেশন বা বিভাজন অবৈধ।",
    invalidRevision: "আবার দেখানোর URL-এ rev-এর মান অবৈধ।",
    invalidUUID: "আবার দেখানোর URL-এ UUID অবৈধ।",
    invalidView: "আবার দেখানোর URL-এ আউটপুটের বিন্যাস অবৈধ।",
    replaySplitMissing:
      "URL-এর কনফিগারেশন / বিভাজন এই ডেটাসেটে আর পাওয়া যাচ্ছে না।",
    offsetOutOfRange: "অফসেট সীমার বাইরে। বর্তমান সীমা 0 থেকে {max}।",
    wrongRow: "API অন্য সারির অফসেট ফেরত দিয়েছে। আবার দেখানো বন্ধ করা হয়েছে।",
    replayRevisionMismatch:
      "ডেটাসেটের সংস্করণ URL-এর সঙ্গে মিলছে না। বিষয়বস্তু বদলে গিয়ে থাকতে পারে বলে আবার দেখানো বন্ধ করা হয়েছে। সংরক্ষিত লেখা বা JSON ফাইল ব্যবহার করুন।",
    replayRevisionMissing:
      "API ডেটাসেটের সংস্করণ দেয়নি। আবার দেখানো বন্ধ করা হয়েছে।",
    replayUUIDMismatch:
      "ব্যক্তির UUID URL-এর সঙ্গে মিলছে না। অন্য কোনো ব্যক্তিকে দেখানো এড়াতে আবার দেখানো বন্ধ করা হয়েছে।",
    truncatedReplay:
      "API এই সারির তথ্য অসম্পূর্ণ দিয়েছে। আবার দেখানো বন্ধ করা হয়েছে।",
  },
  ta: {
    invalidCount: "கிடைக்கும் வரிசைகளின் எண்ணிக்கை செல்லாது.",
    invalidDataset:
      "NVIDIA Nemotron Personas தரவுத்தொகுப்பைத் தேர்ந்தெடுக்கவும்.",
    rateLimited:
      "Hugging Face கோரிக்கைகளின் வேகத்தைக் கட்டுப்படுத்தியுள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயலவும்.",
    httpError:
      "Hugging Face-இலிருந்து பெற முடியவில்லை (HTTP {status}). மீண்டும் முயலவும் அல்லது வேறு நாட்டைத் தேர்ந்தெடுக்கவும்.",
    invalidResponse: "API பதிலைப் படிக்க முடியவில்லை. மீண்டும் முயலவும்.",
    timedOut: "Hugging Face உரிய நேரத்தில் பதிலளிக்கவில்லை. மீண்டும் முயலவும்.",
    connectionFailed:
      "API-உடன் இணைக்க முடியவில்லை. இணைய இணைப்பையும் உலாவியின் பிணையக் கட்டுப்பாடுகளையும் சரிபார்க்கவும்.",
    noData:
      "தரவு கிடைக்கவில்லை. தரவுத்தொகுப்பு பொதுவில் அணுகக்கூடியதா எனச் சரிபார்க்கவும்.",
    rowMissing:
      "அந்த இடமாற்ற மதிப்பில் தரவு இல்லை. தரவுத்தொகுப்பு புதுப்பிக்கப்பட்டிருக்கலாம்.",
    invalidRow: "வரிசைத் தரவின் வடிவம் எதிர்பார்த்தபடி இல்லை.",
    invalidAge: "வயதை 0 முதல் 130 வரையிலான முழு எண்ணாக உள்ளிடவும்.",
    invalidAgeRange:
      "குறைந்தபட்ச வயது அதிகபட்ச வயதை விட அதிகமாக இருக்கக்கூடாது.",
    invalidSex: "பாலின வடிகட்டியின் மதிப்பு செல்லாது.",
    revisionChangedDuringDraw:
      "கோரிக்கை நடக்கும்போது தரவுத்தொகுப்பின் திருத்தப் பதிப்பு மாறிவிட்டது. மீண்டும் தற்செயல் தேர்வு செய்யவும்.",
    noMatch:
      "சரிபார்த்த {count} நபர்களில் பொருத்தமானவர் கிடைக்கவில்லை. வடிகட்டிகளைத் தளர்த்தவும் அல்லது மீண்டும் தற்செயல் தேர்வு செய்யவும்.",
    truncatedDraw:
      "API இந்த வரிசையின் தரவை முழுமையாக வழங்கவில்லை. வேறு நபரைத் தேர்ந்தெடுக்கவும்.",
    splitsChanged:
      "தரவில் கிடைக்கும் மொழிகள் மாறிவிட்டன. மொழியைத் தேர்ந்தெடுத்து மீண்டும் தற்செயல் தேர்வு செய்யவும்.",
    invalidURL: "மீண்டும் காட்டுவதற்கான URL அல்லது வினவல் சரம் செல்லாது.",
    invalidReplayDataset:
      "மீண்டும் காட்டுவதற்கான URL-இல் உள்ள தரவுத்தொகுப்பு செல்லாது.",
    invalidOffset:
      "மீண்டும் காட்டுவதற்கான இடமாற்ற மதிப்பு பூஜ்ஜியம் அல்லது அதற்கு மேலான முழு எண்ணாக இருக்க வேண்டும்.",
    invalidSplit: "அமைவோ தரவுப் பிரிவோ செல்லாது.",
    invalidRevision: "மீண்டும் காட்டுவதற்கான URL-இல் rev மதிப்பு செல்லாது.",
    invalidUUID: "மீண்டும் காட்டுவதற்கான URL-இல் UUID செல்லாது.",
    invalidView: "மீண்டும் காட்டுவதற்கான URL-இல் வெளியீட்டு வடிவம் செல்லாது.",
    replaySplitMissing:
      "URL-இல் உள்ள அமைவு / தரவுப் பிரிவு இந்தத் தரவுத்தொகுப்பில் இனி கிடைக்காது.",
    offsetOutOfRange:
      "இடமாற்ற மதிப்பு வரம்புக்கு வெளியே உள்ளது. தற்போதைய வரம்பு 0 முதல் {max} வரை.",
    wrongRow:
      "API வேறு வரிசை இடமாற்ற மதிப்பை வழங்கியது. மீண்டும் காட்டுவது நிறுத்தப்பட்டது.",
    replayRevisionMismatch:
      "தரவுத்தொகுப்பின் திருத்தப் பதிப்பு URL-இல் உள்ளதுடன் பொருந்தவில்லை. உள்ளடக்கம் மாறியிருக்கலாம் என்பதால் மீண்டும் காட்டுவது நிறுத்தப்பட்டது. சேமித்த உரை அல்லது JSON கோப்பைப் பயன்படுத்தவும்.",
    replayRevisionMissing:
      "API தரவுத்தொகுப்பின் திருத்தப் பதிப்பை வழங்கவில்லை. மீண்டும் காட்டுவது நிறுத்தப்பட்டது.",
    replayUUIDMismatch:
      "நபரின் UUID, URL-இல் உள்ளதுடன் பொருந்தவில்லை. வேறு நபரைக் காட்டுவதைத் தவிர்க்க மீண்டும் காட்டுவது நிறுத்தப்பட்டது.",
    truncatedReplay:
      "API இந்த வரிசையின் தரவை முழுமையாக வழங்கவில்லை. மீண்டும் காட்டுவது நிறுத்தப்பட்டது.",
  },
  te: {
    invalidCount: "అందుబాటులో ఉన్న వరుసల సంఖ్య చెల్లదు.",
    invalidDataset: "NVIDIA Nemotron Personas డేటాసెట్‌ను ఎంచుకోండి.",
    rateLimited:
      "Hugging Face అభ్యర్థనల వేగాన్ని పరిమితం చేసింది. కొద్దిసేపు వేచి ఉండి మళ్లీ ప్రయత్నించండి.",
    httpError:
      "Hugging Face నుంచి పొందలేకపోయింది (HTTP {status}). మళ్లీ ప్రయత్నించండి లేదా మరో దేశాన్ని ఎంచుకోండి.",
    invalidResponse: "API ప్రతిస్పందనను చదవలేకపోయింది. మళ్లీ ప్రయత్నించండి.",
    timedOut: "Hugging Face సకాలంలో స్పందించలేదు. మళ్లీ ప్రయత్నించండి.",
    connectionFailed:
      "APIకి కనెక్ట్ కాలేకపోయింది. మీ ఇంటర్నెట్ కనెక్షన్‌ను, బ్రౌజర్ నెట్‌వర్క్ పరిమితులను తనిఖీ చేయండి.",
    noData:
      "డేటా అందుబాటులో లేదు. డేటాసెట్‌ను అందరూ యాక్సెస్ చేయగలరో లేదో తనిఖీ చేయండి.",
    rowMissing: "ఆ ఆఫ్‌సెట్ వద్ద డేటా లేదు. డేటాసెట్ నవీకరించబడి ఉండవచ్చు.",
    invalidRow: "వరుస డేటా ఆకృతి ఊహించిన విధంగా లేదు.",
    invalidAge: "వయస్సును 0 నుంచి 130 మధ్య పూర్ణసంఖ్యగా నమోదు చేయండి.",
    invalidAgeRange: "కనిష్ఠ వయస్సు గరిష్ఠ వయస్సు కంటే ఎక్కువ ఉండకూడదు.",
    invalidSex: "లింగం ఫిల్టర్ విలువ చెల్లదు.",
    revisionChangedDuringDraw:
      "అభ్యర్థన జరుగుతున్నప్పుడు డేటాసెట్ సంస్కరణ మారింది. మళ్లీ యాదృచ్ఛిక ఎంపిక చేయండి.",
    noMatch:
      "తనిఖీ చేసిన {count} మందిలో సరిపోయే వ్యక్తి దొరకలేదు. ఫిల్టర్లను సడలించండి లేదా మళ్లీ యాదృచ్ఛిక ఎంపిక చేయండి.",
    truncatedDraw:
      "API ఈ వరుస డేటాను అసంపూర్ణంగా ఇచ్చింది. మరో వ్యక్తిని ఎంచుకోండి.",
    splitsChanged:
      "డేటాలో అందుబాటులో ఉన్న భాషలు మారాయి. భాషను ఎంచుకుని మళ్లీ యాదృచ్ఛిక ఎంపిక చేయండి.",
    invalidURL: "మళ్లీ చూపించే URL లేదా ప్రశ్న స్ట్రింగ్ చెల్లదు.",
    invalidReplayDataset: "మళ్లీ చూపించే URLలోని డేటాసెట్ చెల్లదు.",
    invalidOffset:
      "మళ్లీ చూపించడానికి ఆఫ్‌సెట్ సున్నా లేదా అంతకంటే ఎక్కువ పూర్ణసంఖ్యగా ఉండాలి.",
    invalidSplit: "కాన్ఫిగరేషన్ లేదా డేటా విభజన చెల్లదు.",
    invalidRevision: "మళ్లీ చూపించే URLలో rev విలువ చెల్లదు.",
    invalidUUID: "మళ్లీ చూపించే URLలో UUID చెల్లదు.",
    invalidView: "మళ్లీ చూపించే URLలో అవుట్‌పుట్ ఆకృతి చెల్లదు.",
    replaySplitMissing:
      "URLలోని కాన్ఫిగరేషన్ / డేటా విభజన ఈ డేటాసెట్‌లో ఇక అందుబాటులో లేదు.",
    offsetOutOfRange:
      "ఆఫ్‌సెట్ పరిధి దాటింది. ప్రస్తుత పరిధి 0 నుంచి {max} వరకు.",
    wrongRow:
      "API వేరే వరుస ఆఫ్‌సెట్‌ను ఇచ్చింది. మళ్లీ చూపించడం ఆపివేయబడింది.",
    replayRevisionMismatch:
      "డేటాసెట్ సంస్కరణ URLలో ఉన్నదానితో సరిపోలడం లేదు. సమాచారం మారి ఉండవచ్చు కాబట్టి మళ్లీ చూపించడం ఆపివేయబడింది. భద్రపరిచిన వచన లేదా JSON ఫైల్‌ను ఉపయోగించండి.",
    replayRevisionMissing:
      "API డేటాసెట్ సంస్కరణను ఇవ్వలేదు. మళ్లీ చూపించడం ఆపివేయబడింది.",
    replayUUIDMismatch:
      "వ్యక్తి UUID, URLలో ఉన్నదానితో సరిపోలడం లేదు. వేరే వ్యక్తిని చూపించకుండా ఉండటానికి మళ్లీ చూపించడం ఆపివేయబడింది.",
    truncatedReplay:
      "API ఈ వరుస డేటాను అసంపూర్ణంగా ఇచ్చింది. మళ్లీ చూపించడం ఆపివేయబడింది.",
  },
  mr: {
    invalidCount: "उपलब्ध नोंदींची संख्या अवैध आहे.",
    invalidDataset: "NVIDIA Nemotron Personas चा डेटासेट निवडा.",
    rateLimited:
      "Hugging Face वरील विनंत्यांची मर्यादा गाठली आहे. थोडा वेळ थांबून पुन्हा प्रयत्न करा.",
    httpError:
      "Hugging Face वरून माहिती मिळाली नाही (HTTP {status}). पुन्हा प्रयत्न करा किंवा दुसरा देश निवडा.",
    invalidResponse: "API चा प्रतिसाद वाचता आला नाही. पुन्हा प्रयत्न करा.",
    timedOut: "Hugging Face ने वेळेत प्रतिसाद दिला नाही. पुन्हा प्रयत्न करा.",
    connectionFailed:
      "API शी जोडता आले नाही. इंटरनेट जोडणी आणि ब्राउझरवरील नेटवर्क निर्बंध तपासा.",
    noData:
      "माहिती उपलब्ध नाही. डेटासेट सार्वजनिकरीत्या उपलब्ध आहे का ते तपासा.",
    rowMissing: "दिलेल्या स्थानावर नोंद नाही. डेटासेट अद्ययावत झाला असू शकतो.",
    invalidRow: "नोंदीतील माहितीचे स्वरूप अपेक्षेपेक्षा वेगळे आहे.",
    invalidAge: "वय 0 ते 130 दरम्यानच्या पूर्णांकात द्या.",
    invalidAgeRange: "किमान वय कमाल वयापेक्षा जास्त नसावे.",
    invalidSex: "लिंगासाठी दिलेली निवड अवैध आहे.",
    revisionChangedDuringDraw:
      "माहिती मिळवताना डेटासेटची आवृत्ती बदलली. पुन्हा निवड करा.",
    noMatch:
      "तपासलेल्या {count} उमेदवारांमध्ये अटींशी जुळणारी व्यक्ती सापडली नाही. अटी सैल करा किंवा पुन्हा निवड करा.",
    truncatedDraw:
      "API ने या नोंदीतील मजकूर अपूर्ण दिला आहे. दुसरी व्यक्ती निवडा.",
    splitsChanged:
      "माहितीसाठी उपलब्ध भाषा बदलल्या आहेत. भाषा निवडून पुन्हा व्यक्ती निवडा.",
    invalidURL: "पुन्हा दाखवण्यासाठी दिलेला URL किंवा क्वेरी मजकूर अवैध आहे.",
    invalidReplayDataset: "URL मधील डेटासेट अवैध आहे.",
    invalidOffset:
      "URL मधील offset हा शून्य किंवा त्यापेक्षा मोठा पूर्णांक असावा.",
    invalidSplit: "config किंवा split अवैध आहे.",
    invalidRevision: "URL मधील rev मूल्य अवैध आहे.",
    invalidUUID: "URL मधील UUID अवैध आहे.",
    invalidView: "URL मधील मजकुराचे स्वरूप अवैध आहे.",
    replaySplitMissing:
      "URL मधील config / split या डेटासेटमध्ये आता उपलब्ध नाही.",
    offsetOutOfRange:
      "offset मर्यादेबाहेर आहे. सध्याची वैध मर्यादा 0 ते {max} आहे.",
    wrongRow:
      "API ने वेगळ्या स्थानावरील नोंद दिली. पुन्हा दाखवण्याची प्रक्रिया थांबवली.",
    replayRevisionMismatch:
      "डेटासेटची आवृत्ती URL मधील आवृत्तीशी जुळत नाही. मजकूर बदलला असण्याची शक्यता असल्याने प्रक्रिया थांबवली. जतन केलेली मजकूर किंवा JSON फाइल वापरा.",
    replayRevisionMissing:
      "API कडून डेटासेटची आवृत्ती मिळाली नाही. पुन्हा दाखवण्याची प्रक्रिया थांबवली.",
    replayUUIDMismatch:
      "व्यक्तीचा UUID URL मधील UUID शी जुळत नाही. वेगळी व्यक्ती दाखवली जाऊ नये म्हणून प्रक्रिया थांबवली.",
    truncatedReplay:
      "API ने या नोंदीतील मजकूर अपूर्ण दिला आहे. पुन्हा दाखवण्याची प्रक्रिया थांबवली.",
  },
  gu: {
    invalidCount: "ઉપલબ્ધ નોંધોની સંખ્યા અમાન્ય છે.",
    invalidDataset: "NVIDIA Nemotron Personasનો ડેટાસેટ પસંદ કરો.",
    rateLimited:
      "Hugging Face પરની વિનંતીઓની મર્યાદા પહોંચી ગઈ છે. થોડી વાર પછી ફરી પ્રયાસ કરો.",
    httpError:
      "Hugging Face પરથી માહિતી મેળવી શકાઈ નથી (HTTP {status}). ફરી પ્રયાસ કરો અથવા બીજો દેશ પસંદ કરો.",
    invalidResponse: "APIનો પ્રતિસાદ વાંચી શકાયો નથી. ફરી પ્રયાસ કરો.",
    timedOut: "Hugging Faceએ સમયસર પ્રતિસાદ આપ્યો નથી. ફરી પ્રયાસ કરો.",
    connectionFailed:
      "API સાથે જોડાઈ શકાયું નથી. ઇન્ટરનેટ જોડાણ અને બ્રાઉઝરના નેટવર્ક પ્રતિબંધો તપાસો.",
    noData: "માહિતી ઉપલબ્ધ નથી. ડેટાસેટ જાહેર રીતે ઉપલબ્ધ છે કે નહીં તે તપાસો.",
    rowMissing: "આપેલા સ્થાને કોઈ નોંધ નથી. ડેટાસેટ અપડેટ થયો હોઈ શકે છે.",
    invalidRow: "નોંધની માહિતીનું સ્વરૂપ અપેક્ષા કરતાં જુદું છે.",
    invalidAge: "ઉંમર 0થી 130 વચ્ચેના પૂર્ણાંકમાં આપો.",
    invalidAgeRange: "લઘુત્તમ ઉંમર મહત્તમ ઉંમર કરતાં વધારે ન હોવી જોઈએ.",
    invalidSex: "લિંગ માટેની પસંદગી અમાન્ય છે.",
    revisionChangedDuringDraw:
      "માહિતી મેળવતી વખતે ડેટાસેટની આવૃત્તિ બદલાઈ ગઈ. ફરી પસંદગી કરો.",
    noMatch:
      "તપાસેલા {count} ઉમેદવારોમાં શરતો સાથે મેળ ખાતી વ્યક્તિ મળી નથી. શરતો હળવી કરો અથવા ફરી પસંદગી કરો.",
    truncatedDraw:
      "APIએ આ નોંધનું લખાણ અધૂરું આપ્યું છે. બીજી વ્યક્તિ પસંદ કરો.",
    splitsChanged:
      "માહિતી માટે ઉપલબ્ધ ભાષાઓ બદલાઈ ગઈ છે. ભાષા પસંદ કરીને ફરી વ્યક્તિ પસંદ કરો.",
    invalidURL: "ફરી બતાવવા માટે આપેલો URL અથવા ક્વેરી અમાન્ય છે.",
    invalidReplayDataset: "URLમાંનો ડેટાસેટ અમાન્ય છે.",
    invalidOffset: "URLમાંનો offset શૂન્ય અથવા તેનાથી મોટો પૂર્ણાંક હોવો જોઈએ.",
    invalidSplit: "config અથવા split અમાન્ય છે.",
    invalidRevision: "URLમાંનું rev મૂલ્ય અમાન્ય છે.",
    invalidUUID: "URLમાંનો UUID અમાન્ય છે.",
    invalidView: "URLમાં આપેલું લખાણનું સ્વરૂપ અમાન્ય છે.",
    replaySplitMissing: "URLમાંનું config / split આ ડેટાસેટમાં હવે ઉપલબ્ધ નથી.",
    offsetOutOfRange:
      "offset મર્યાદાની બહાર છે. હાલની માન્ય મર્યાદા 0થી {max} છે.",
    wrongRow: "APIએ જુદા સ્થાનની નોંધ આપી. ફરી બતાવવાની પ્રક્રિયા અટકાવી.",
    replayRevisionMismatch:
      "ડેટાસેટની આવૃત્તિ URLમાંની આવૃત્તિ સાથે મેળ ખાતી નથી. લખાણ બદલાયું હોઈ શકે છે, તેથી પ્રક્રિયા અટકાવી. સાચવેલી લખાણ અથવા JSON ફાઇલ વાપરો.",
    replayRevisionMissing:
      "APIએ ડેટાસેટની આવૃત્તિ આપી નથી. ફરી બતાવવાની પ્રક્રિયા અટકાવી.",
    replayUUIDMismatch:
      "વ્યક્તિનો UUID URLમાંના UUID સાથે મેળ ખાતો નથી. જુદી વ્યક્તિ દેખાઈ ન જાય તે માટે પ્રક્રિયા અટકાવી.",
    truncatedReplay:
      "APIએ આ નોંધનું લખાણ અધૂરું આપ્યું છે. ફરી બતાવવાની પ્રક્રિયા અટકાવી.",
  },
  id: {
    invalidCount: "Jumlah baris yang tersedia tidak valid.",
    invalidDataset: "Pilih dataset NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face membatasi frekuensi permintaan. Tunggu sebentar lalu coba lagi.",
    httpError:
      "Tidak dapat mengambil data dari Hugging Face (HTTP {status}). Coba lagi atau pilih negara lain.",
    invalidResponse: "Respons API tidak dapat dibaca. Coba lagi.",
    timedOut: "Hugging Face tidak merespons tepat waktu. Coba lagi.",
    connectionFailed:
      "Tidak dapat terhubung ke API. Periksa koneksi internet dan pembatasan jaringan browser.",
    noData:
      "Tidak ada data yang tersedia. Periksa apakah dataset dapat diakses secara publik.",
    rowMissing:
      "Tidak ada data pada offset tersebut. Dataset mungkin telah diperbarui.",
    invalidRow: "Format data baris tidak sesuai harapan.",
    invalidAge: "Masukkan usia berupa bilangan bulat dari 0 hingga 130.",
    invalidAgeRange: "Usia minimum tidak boleh melebihi usia maksimum.",
    invalidSex: "Nilai filter jenis kelamin tidak valid.",
    revisionChangedDuringDraw:
      "Revisi dataset berubah selama permintaan. Lakukan pemilihan lagi.",
    noMatch:
      "Tidak ditemukan persona yang cocok di antara {count} kandidat yang diperiksa. Longgarkan filter atau lakukan pemilihan lagi.",
    truncatedDraw: "API memotong isi baris ini. Pilih persona lain.",
    splitsChanged:
      "Bahasa data yang tersedia telah berubah. Pilih bahasa dan lakukan pemilihan lagi.",
    invalidURL:
      "URL atau string kueri untuk menampilkan kembali persona tidak valid.",
    invalidReplayDataset:
      "Dataset dalam URL untuk menampilkan kembali persona tidak valid.",
    invalidOffset:
      "Offset untuk menampilkan kembali persona harus berupa bilangan bulat nonnegatif.",
    invalidSplit: "Konfigurasi atau bagian data tidak valid.",
    invalidRevision:
      "Nilai rev dalam URL untuk menampilkan kembali persona tidak valid.",
    invalidUUID:
      "UUID dalam URL untuk menampilkan kembali persona tidak valid.",
    invalidView:
      "Format keluaran dalam URL untuk menampilkan kembali persona tidak valid.",
    replaySplitMissing:
      "Konfigurasi / bagian data dalam URL tidak lagi tersedia di dataset ini.",
    offsetOutOfRange:
      "Offset di luar rentang. Rentang saat ini adalah 0 hingga {max}.",
    wrongRow:
      "API mengembalikan offset baris yang berbeda. Penampilan ulang dihentikan.",
    replayRevisionMismatch:
      "Revisi dataset berbeda dari yang tercatat dalam URL. Penampilan ulang dihentikan karena isi mungkin telah berubah. Gunakan teks atau file JSON yang sudah disimpan.",
    replayRevisionMissing:
      "API tidak memberikan revisi dataset. Penampilan ulang dihentikan.",
    replayUUIDMismatch:
      "UUID persona berbeda dari yang tercatat dalam URL. Penampilan ulang dihentikan agar persona lain tidak ditampilkan.",
    truncatedReplay: "API memotong isi baris ini. Penampilan ulang dihentikan.",
  },
  ms: {
    invalidCount: "Bilangan baris yang tersedia tidak sah.",
    invalidDataset: "Pilih set data NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face telah mengehadkan kadar permintaan. Tunggu sebentar dan cuba lagi.",
    httpError:
      "Tidak dapat mengambil data daripada Hugging Face (HTTP {status}). Cuba lagi atau pilih negara lain.",
    invalidResponse: "Respons API tidak dapat dibaca. Cuba lagi.",
    timedOut:
      "Hugging Face tidak memberikan respons dalam masa yang ditetapkan. Cuba lagi.",
    connectionFailed:
      "Tidak dapat menyambung ke API. Semak sambungan internet dan sekatan rangkaian pelayar.",
    noData:
      "Tiada data tersedia. Semak sama ada set data boleh diakses secara umum.",
    rowMissing:
      "Tiada data pada ofset tersebut. Set data mungkin telah dikemas kini.",
    invalidRow: "Format data baris tidak seperti yang dijangkakan.",
    invalidAge: "Masukkan umur sebagai nombor bulat antara 0 hingga 130.",
    invalidAgeRange: "Umur minimum tidak boleh melebihi umur maksimum.",
    invalidSex: "Nilai penapis jantina tidak sah.",
    revisionChangedDuringDraw:
      "Semakan set data berubah semasa permintaan. Buat pemilihan semula.",
    noMatch:
      "Tiada persona yang sepadan ditemukan dalam {count} calon yang disemak. Longgarkan penapis atau buat pemilihan semula.",
    truncatedDraw: "API memendekkan kandungan baris ini. Pilih persona lain.",
    splitsChanged:
      "Bahasa data yang tersedia telah berubah. Pilih bahasa dan buat pemilihan semula.",
    invalidURL: "URL atau rentetan pertanyaan untuk paparan semula tidak sah.",
    invalidReplayDataset: "Set data dalam URL paparan semula tidak sah.",
    invalidOffset: "Ofset paparan semula mestilah nombor bulat bukan negatif.",
    invalidSplit: "Konfigurasi atau pecahan data tidak sah.",
    invalidRevision: "Nilai rev dalam URL paparan semula tidak sah.",
    invalidUUID: "UUID dalam URL paparan semula tidak sah.",
    invalidView: "Format output dalam URL paparan semula tidak sah.",
    replaySplitMissing:
      "Konfigurasi / pecahan data dalam URL tidak lagi tersedia dalam set data ini.",
    offsetOutOfRange:
      "Ofset berada di luar julat. Julat semasa ialah 0 hingga {max}.",
    wrongRow:
      "API memberikan ofset baris yang berbeza. Paparan semula dihentikan.",
    replayRevisionMismatch:
      "Semakan set data berbeza daripada URL. Paparan semula dihentikan kerana kandungan mungkin telah berubah. Gunakan teks atau fail JSON yang disimpan.",
    replayRevisionMissing:
      "API tidak memberikan semakan set data. Paparan semula dihentikan.",
    replayUUIDMismatch:
      "UUID persona berbeza daripada URL. Paparan semula dihentikan supaya persona yang berlainan tidak dipaparkan.",
    truncatedReplay:
      "API memendekkan kandungan baris ini. Paparan semula dihentikan.",
  },
  vi: {
    invalidCount: "Số dòng có thể truy cập không hợp lệ.",
    invalidDataset: "Hãy chọn một bộ dữ liệu NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face đã giới hạn tần suất yêu cầu. Chờ một lát rồi thử lại.",
    httpError:
      "Không thể lấy dữ liệu từ Hugging Face (HTTP {status}). Hãy thử lại hoặc chọn quốc gia khác.",
    invalidResponse: "Không thể đọc phản hồi API. Hãy thử lại.",
    timedOut: "Hugging Face không phản hồi kịp thời. Hãy thử lại.",
    connectionFailed:
      "Không thể kết nối với API. Kiểm tra kết nối internet và các hạn chế mạng của trình duyệt.",
    noData:
      "Không có dữ liệu. Kiểm tra xem bộ dữ liệu có được truy cập công khai hay không.",
    rowMissing:
      "Không có dữ liệu tại vị trí đó. Bộ dữ liệu có thể đã được cập nhật.",
    invalidRow: "Định dạng dữ liệu dòng không đúng như dự kiến.",
    invalidAge: "Nhập tuổi bằng số nguyên từ 0 đến 130.",
    invalidAgeRange: "Tuổi tối thiểu không được vượt quá tuổi tối đa.",
    invalidSex: "Giá trị bộ lọc giới tính không hợp lệ.",
    revisionChangedDuringDraw:
      "Phiên bản bộ dữ liệu đã thay đổi trong lúc yêu cầu. Hãy chọn lại.",
    noMatch:
      "Không tìm thấy nhân vật phù hợp trong {count} ứng viên đã kiểm tra. Nới lỏng bộ lọc hoặc chọn lại.",
    truncatedDraw: "API đã cắt bớt nội dung dòng này. Hãy chọn nhân vật khác.",
    splitsChanged:
      "Các ngôn ngữ dữ liệu có thể chọn đã thay đổi. Hãy chọn ngôn ngữ rồi chọn lại nhân vật.",
    invalidURL: "URL hoặc chuỗi truy vấn để hiển thị lại không hợp lệ.",
    invalidReplayDataset: "Bộ dữ liệu trong URL hiển thị lại không hợp lệ.",
    invalidOffset: "Vị trí dòng để hiển thị lại phải là số nguyên không âm.",
    invalidSplit: "Cấu hình hoặc phần dữ liệu không hợp lệ.",
    invalidRevision: "Giá trị rev trong URL hiển thị lại không hợp lệ.",
    invalidUUID: "UUID trong URL hiển thị lại không hợp lệ.",
    invalidView: "Định dạng đầu ra trong URL hiển thị lại không hợp lệ.",
    replaySplitMissing:
      "Cấu hình / phần dữ liệu trong URL không còn có trong bộ dữ liệu này.",
    offsetOutOfRange:
      "Vị trí dòng nằm ngoài phạm vi. Phạm vi hiện tại là từ 0 đến {max}.",
    wrongRow: "API trả về vị trí dòng khác. Đã dừng hiển thị lại.",
    replayRevisionMismatch:
      "Phiên bản bộ dữ liệu khác với URL. Đã dừng hiển thị lại vì nội dung có thể đã thay đổi. Hãy dùng văn bản hoặc tệp JSON đã lưu.",
    replayRevisionMissing:
      "API không cung cấp phiên bản bộ dữ liệu. Đã dừng hiển thị lại.",
    replayUUIDMismatch:
      "UUID của nhân vật khác với URL. Đã dừng hiển thị lại để tránh hiện nhầm nhân vật.",
    truncatedReplay: "API đã cắt bớt nội dung dòng này. Đã dừng hiển thị lại.",
  },
  th: {
    invalidCount: "จำนวนแถวที่ใช้ได้ไม่ถูกต้อง",
    invalidDataset: "เลือกชุดข้อมูล NVIDIA Nemotron Personas",
    rateLimited:
      "Hugging Face จำกัดความถี่ของคำขอ โปรดรอสักครู่แล้วลองอีกครั้ง",
    httpError:
      "ดึงข้อมูลจาก Hugging Face ไม่ได้ (HTTP {status}) โปรดลองอีกครั้งหรือเลือกประเทศอื่น",
    invalidResponse: "อ่านคำตอบจาก API ไม่ได้ โปรดลองอีกครั้ง",
    timedOut: "Hugging Face ไม่ตอบกลับภายในเวลาที่กำหนด โปรดลองอีกครั้ง",
    connectionFailed:
      "เชื่อมต่อ API ไม่ได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและข้อจำกัดเครือข่ายของเบราว์เซอร์",
    noData: "ไม่มีข้อมูลให้ใช้ ตรวจสอบว่าชุดข้อมูลเปิดให้เข้าถึงสาธารณะหรือไม่",
    rowMissing: "ไม่มีข้อมูลที่ออฟเซ็ตนี้ ชุดข้อมูลอาจได้รับการอัปเดตแล้ว",
    invalidRow: "ข้อมูลแถวมีรูปแบบที่ไม่ตรงตามที่คาดไว้",
    invalidAge: "กรอกอายุเป็นจำนวนเต็มตั้งแต่ 0 ถึง 130",
    invalidAgeRange: "อายุขั้นต่ำต้องไม่เกินอายุสูงสุด",
    invalidSex: "ค่าตัวกรองเพศไม่ถูกต้อง",
    revisionChangedDuringDraw:
      "รุ่นของชุดข้อมูลเปลี่ยนระหว่างส่งคำขอ โปรดสุ่มอีกครั้ง",
    noMatch:
      "ไม่พบบุคคลที่ตรงเงื่อนไขใน {count} คนที่ตรวจสอบ ลองผ่อนเงื่อนไขตัวกรองหรือสุ่มอีกครั้ง",
    truncatedDraw: "API ตัดเนื้อหาของแถวนี้บางส่วน โปรดสุ่มบุคคลอื่น",
    splitsChanged:
      "ภาษาของข้อมูลที่ใช้ได้เปลี่ยนไป โปรดเลือกภาษาแล้วสุ่มอีกครั้ง",
    invalidURL: "URL หรือสตริงคิวรีสำหรับแสดงซ้ำไม่ถูกต้อง",
    invalidReplayDataset: "ชุดข้อมูลใน URL สำหรับแสดงซ้ำไม่ถูกต้อง",
    invalidOffset: "ออฟเซ็ตสำหรับแสดงซ้ำต้องเป็นจำนวนเต็มที่ไม่ติดลบ",
    invalidSplit: "การกำหนดค่าหรือส่วนแบ่งข้อมูลไม่ถูกต้อง",
    invalidRevision: "ค่า rev ใน URL สำหรับแสดงซ้ำไม่ถูกต้อง",
    invalidUUID: "UUID ใน URL สำหรับแสดงซ้ำไม่ถูกต้อง",
    invalidView: "รูปแบบผลลัพธ์ใน URL สำหรับแสดงซ้ำไม่ถูกต้อง",
    replaySplitMissing:
      "การกำหนดค่า / ส่วนแบ่งข้อมูลใน URL ไม่มีอยู่ในชุดข้อมูลนี้แล้ว",
    offsetOutOfRange: "ออฟเซ็ตอยู่นอกช่วง ช่วงปัจจุบันคือตั้งแต่ 0 ถึง {max}",
    wrongRow: "API ส่งออฟเซ็ตของแถวอื่นกลับมา จึงหยุดการแสดงซ้ำ",
    replayRevisionMismatch:
      "รุ่นของชุดข้อมูลไม่ตรงกับ URL จึงหยุดการแสดงซ้ำเนื่องจากเนื้อหาอาจเปลี่ยนไป โปรดใช้ข้อความหรือไฟล์ JSON ที่บันทึกไว้",
    replayRevisionMissing: "API ไม่ได้ระบุรุ่นของชุดข้อมูล จึงหยุดการแสดงซ้ำ",
    replayUUIDMismatch:
      "UUID ของบุคคลไม่ตรงกับ URL จึงหยุดการแสดงซ้ำเพื่อป้องกันการแสดงบุคคลอื่น",
    truncatedReplay: "API ตัดเนื้อหาของแถวนี้บางส่วน จึงหยุดการแสดงซ้ำ",
  },
  fil: {
    invalidCount: "Hindi wasto ang bilang ng mga hilerang makukuha.",
    invalidDataset: "Pumili ng dataset na NVIDIA Nemotron Personas.",
    rateLimited:
      "Nilimitahan ng Hugging Face ang dalas ng mga kahilingan. Maghintay sandali at subukan muli.",
    httpError:
      "Hindi makakuha ng datos mula sa Hugging Face (HTTP {status}). Subukan muli o pumili ng ibang bansa.",
    invalidResponse: "Hindi mabasa ang tugon ng API. Subukan muli.",
    timedOut: "Hindi tumugon sa oras ang Hugging Face. Subukan muli.",
    connectionFailed:
      "Hindi makakonekta sa API. Suriin ang koneksiyon sa internet at mga paghihigpit sa network ng browser.",
    noData:
      "Walang datos na makukuha. Tingnan kung bukas sa publiko ang dataset.",
    rowMissing:
      "Walang datos sa posisyong iyon. Maaaring na-update ang dataset.",
    invalidRow: "Hindi inaasahan ang anyo ng datos ng hilera.",
    invalidAge: "Maglagay ng edad na buong bilang mula 0 hanggang 130.",
    invalidAgeRange:
      "Hindi dapat lumampas ang pinakamababang edad sa pinakamataas na edad.",
    invalidSex: "Hindi wasto ang halaga ng salaan sa kasarian.",
    revisionChangedDuringDraw:
      "Nagbago ang rebisyon ng dataset habang kinukuha ito. Pumili muli.",
    noMatch:
      "Walang tumugmang persona sa {count} kandidatong sinuri. Luwagan ang mga salaan o pumili muli.",
    truncatedDraw:
      "Pinaikli ng API ang nilalaman ng hilerang ito. Pumili ng ibang persona.",
    splitsChanged:
      "Nagbago ang mga wikang makukuha para sa datos. Pumili ng wika at pumili muli ng persona.",
    invalidURL:
      "Hindi wasto ang URL o query string para sa muling pagpapakita.",
    invalidReplayDataset:
      "Hindi wasto ang dataset sa URL para sa muling pagpapakita.",
    invalidOffset:
      "Ang posisyon para sa muling pagpapakita ay dapat buong bilang na hindi negatibo.",
    invalidSplit: "Hindi wasto ang pagsasaayos o paghahati ng datos.",
    invalidRevision:
      "Hindi wasto ang halagang rev sa URL para sa muling pagpapakita.",
    invalidUUID: "Hindi wasto ang UUID sa URL para sa muling pagpapakita.",
    invalidView:
      "Hindi wasto ang anyo ng resulta sa URL para sa muling pagpapakita.",
    replaySplitMissing:
      "Hindi na makukuha sa dataset na ito ang pagsasaayos / paghahati ng datos sa URL.",
    offsetOutOfRange:
      "Lampas sa saklaw ang posisyon. Ang kasalukuyang saklaw ay 0 hanggang {max}.",
    wrongRow:
      "Ibang posisyon ng hilera ang ibinalik ng API. Itinigil ang muling pagpapakita.",
    replayRevisionMismatch:
      "Iba ang rebisyon ng dataset sa nakasaad sa URL. Itinigil ang muling pagpapakita dahil maaaring nagbago ang nilalaman. Gamitin ang na-save na teksto o JSON file.",
    replayRevisionMissing:
      "Walang ibinigay na rebisyon ng dataset ang API. Itinigil ang muling pagpapakita.",
    replayUUIDMismatch:
      "Iba ang UUID ng persona sa nakasaad sa URL. Itinigil ang muling pagpapakita upang maiwasang magpakita ng ibang persona.",
    truncatedReplay:
      "Pinaikli ng API ang nilalaman ng hilerang ito. Itinigil ang muling pagpapakita.",
  },
  es: {
    invalidCount: "El número de filas disponibles no es válido.",
    invalidDataset: "Selecciona un conjunto de datos NVIDIA Nemotron Personas.",
    rateLimited:
      "Se ha alcanzado el límite de solicitudes de Hugging Face. Espera un momento y vuelve a intentarlo.",
    httpError:
      "No se pudieron obtener datos de Hugging Face (HTTP {status}). Vuelve a intentarlo o selecciona otro país.",
    invalidResponse:
      "No se pudo leer la respuesta de la API. Vuelve a intentarlo.",
    timedOut: "Hugging Face no respondió a tiempo. Vuelve a intentarlo.",
    connectionFailed:
      "No se pudo conectar con la API. Comprueba la conexión a internet y las restricciones de red del navegador.",
    noData:
      "No hay datos disponibles. Comprueba que el conjunto de datos sea de acceso público.",
    rowMissing:
      "No hay datos en esa posición. Es posible que el conjunto de datos se haya actualizado.",
    invalidRow: "Los datos de la fila tienen un formato inesperado.",
    invalidAge: "Introduce una edad entera entre 0 y 130.",
    invalidAgeRange: "La edad mínima no puede superar la edad máxima.",
    invalidSex: "El valor del filtro de sexo no es válido.",
    revisionChangedDuringDraw:
      "La versión del conjunto de datos cambió durante la solicitud. Repite la selección.",
    noMatch:
      "No se encontró ningún perfil que coincida entre los {count} candidatos revisados. Amplía los filtros o repite la selección.",
    truncatedDraw: "La API ha truncado esta fila. Selecciona otro perfil.",
    splitsChanged:
      "Han cambiado los idiomas disponibles. Selecciona un idioma y repite la selección.",
    invalidURL:
      "El enlace del perfil o sus parámetros de consulta no son válidos.",
    invalidReplayDataset:
      "El valor de dataset en el enlace del perfil no es válido.",
    invalidOffset:
      "El valor de offset en el enlace del perfil debe ser un entero no negativo.",
    invalidSplit: "El valor de config o split no es válido.",
    invalidRevision: "El valor de rev en el enlace del perfil no es válido.",
    invalidUUID: "El UUID en el enlace del perfil no es válido.",
    invalidView: "El formato de salida en el enlace del perfil no es válido.",
    replaySplitMissing:
      "La combinación config / split de la URL ya no está disponible en este conjunto de datos.",
    offsetOutOfRange:
      "El valor de offset está fuera de rango. El rango actual va de 0 a {max}.",
    wrongRow:
      "La API devolvió una fila en otra posición. Se ha detenido la restauración.",
    replayRevisionMismatch:
      "La versión del conjunto de datos no coincide con la URL. Se ha detenido la restauración porque el contenido puede haber cambiado. Usa un archivo de texto o JSON guardado.",
    replayRevisionMissing:
      "La API no proporcionó la versión del conjunto de datos. Se ha detenido la restauración.",
    replayUUIDMismatch:
      "El UUID del perfil no coincide con la URL. Se ha detenido la restauración para evitar mostrar otro perfil.",
    truncatedReplay:
      "La API ha truncado esta fila. Se ha detenido la restauración.",
  },
  fr: {
    invalidCount: "Le nombre de lignes disponibles n’est pas valide.",
    invalidDataset: "Sélectionnez un jeu de données NVIDIA Nemotron Personas.",
    rateLimited:
      "La limite de requêtes de Hugging Face a été atteinte. Patientez un instant, puis réessayez.",
    httpError:
      "Impossible de récupérer les données depuis Hugging Face (HTTP {status}). Réessayez ou sélectionnez un autre pays.",
    invalidResponse: "Impossible de lire la réponse de l’API. Réessayez.",
    timedOut: "Hugging Face n’a pas répondu à temps. Réessayez.",
    connectionFailed:
      "Impossible de se connecter à l’API. Vérifiez votre connexion internet et les restrictions réseau du navigateur.",
    noData:
      "Aucune donnée n’est disponible. Vérifiez que le jeu de données est accessible au public.",
    rowMissing:
      "Aucune donnée ne se trouve à cette position. Le jeu de données a peut-être été mis à jour.",
    invalidRow: "Le format des données de la ligne est inattendu.",
    invalidAge: "Saisissez un âge entier compris entre 0 et 130.",
    invalidAgeRange: "L’âge minimum ne doit pas dépasser l’âge maximum.",
    invalidSex: "La valeur du filtre de sexe n’est pas valide.",
    revisionChangedDuringDraw:
      "La version du jeu de données a changé pendant la requête. Relancez la sélection.",
    noMatch:
      "Aucun des {count} profils examinés ne correspond aux critères. Élargissez les filtres ou relancez la sélection.",
    truncatedDraw: "L’API a tronqué cette ligne. Sélectionnez un autre profil.",
    splitsChanged:
      "Les langues disponibles ont changé. Sélectionnez une langue et relancez la sélection.",
    invalidURL:
      "Le lien du profil ou ses paramètres de requête ne sont pas valides.",
    invalidReplayDataset:
      "La valeur de dataset dans le lien du profil n’est pas valide.",
    invalidOffset:
      "La valeur de offset dans le lien du profil doit être un entier positif ou nul.",
    invalidSplit: "La valeur de config ou de split n’est pas valide.",
    invalidRevision:
      "La valeur de rev dans le lien du profil n’est pas valide.",
    invalidUUID: "L’UUID dans le lien du profil n’est pas valide.",
    invalidView: "Le format de sortie dans le lien du profil n’est pas valide.",
    replaySplitMissing:
      "La combinaison config / split indiquée dans l’URL n’est plus disponible dans ce jeu de données.",
    offsetOutOfRange:
      "La valeur de offset est hors limites. La plage actuelle va de 0 à {max}.",
    wrongRow:
      "L’API a renvoyé une ligne à une autre position. La restauration a été interrompue.",
    replayRevisionMismatch:
      "La version du jeu de données ne correspond pas à celle de l’URL. La restauration a été interrompue, car le contenu a pu changer. Utilisez un fichier texte ou JSON enregistré.",
    replayRevisionMissing:
      "L’API n’a pas fourni de version du jeu de données. La restauration a été interrompue.",
    replayUUIDMismatch:
      "L’UUID du profil ne correspond pas à celui de l’URL. La restauration a été interrompue pour éviter d’afficher un autre profil.",
    truncatedReplay:
      "L’API a tronqué cette ligne. La restauration a été interrompue.",
  },
  pt: {
    invalidCount: "O número de linhas disponíveis é inválido.",
    invalidDataset: "Selecione um conjunto de dados NVIDIA Nemotron Personas.",
    rateLimited:
      "O limite de solicitações do Hugging Face foi atingido. Aguarde um momento e tente novamente.",
    httpError:
      "Não foi possível obter dados do Hugging Face (HTTP {status}). Tente novamente ou selecione outro país.",
    invalidResponse: "Não foi possível ler a resposta da API. Tente novamente.",
    timedOut: "O Hugging Face não respondeu a tempo. Tente novamente.",
    connectionFailed:
      "Não foi possível conectar à API. Verifique a conexão com a internet e as restrições de rede do navegador.",
    noData:
      "Não há dados disponíveis. Verifique se o conjunto de dados é acessível ao público.",
    rowMissing:
      "Não há dados nessa posição. O conjunto de dados pode ter sido atualizado.",
    invalidRow: "Os dados da linha têm um formato inesperado.",
    invalidAge: "Informe a idade como um número inteiro de 0 a 130.",
    invalidAgeRange: "A idade mínima não pode ultrapassar a idade máxima.",
    invalidSex: "O valor do filtro de sexo é inválido.",
    revisionChangedDuringDraw:
      "A versão do conjunto de dados mudou durante a solicitação. Faça outra seleção.",
    noMatch:
      "Nenhum dos {count} perfis verificados corresponde aos critérios. Amplie os filtros ou faça outra seleção.",
    truncatedDraw: "A API truncou esta linha. Selecione outro perfil.",
    splitsChanged:
      "Os idiomas disponíveis mudaram. Selecione um idioma e faça outra seleção.",
    invalidURL:
      "O link do perfil ou seus parâmetros de consulta são inválidos.",
    invalidReplayDataset: "O valor de dataset no link do perfil é inválido.",
    invalidOffset:
      "O valor de offset no link do perfil deve ser um número inteiro não negativo.",
    invalidSplit: "O valor de config ou split é inválido.",
    invalidRevision: "O valor de rev no link do perfil é inválido.",
    invalidUUID: "O UUID no link do perfil é inválido.",
    invalidView: "O formato de saída no link do perfil é inválido.",
    replaySplitMissing:
      "A combinação config / split da URL não está mais disponível neste conjunto de dados.",
    offsetOutOfRange:
      "O valor de offset está fora do intervalo. O intervalo atual vai de 0 a {max}.",
    wrongRow:
      "A API retornou uma linha em outra posição. A restauração foi interrompida.",
    replayRevisionMismatch:
      "A versão do conjunto de dados não corresponde à URL. A restauração foi interrompida porque o conteúdo pode ter mudado. Use um arquivo de texto ou JSON salvo.",
    replayRevisionMissing:
      "A API não forneceu a versão do conjunto de dados. A restauração foi interrompida.",
    replayUUIDMismatch:
      "O UUID do perfil não corresponde à URL. A restauração foi interrompida para evitar a exibição de outro perfil.",
    truncatedReplay:
      "A API truncou esta linha. A restauração foi interrompida.",
  },
  de: {
    invalidCount: "Die Anzahl der verfügbaren Zeilen ist ungültig.",
    invalidDataset: "Wählen Sie einen Datensatz von NVIDIA Nemotron Personas.",
    rateLimited:
      "Das Anfragelimit von Hugging Face wurde erreicht. Warten Sie kurz und versuchen Sie es erneut.",
    httpError:
      "Daten konnten nicht von Hugging Face abgerufen werden (HTTP {status}). Versuchen Sie es erneut oder wählen Sie ein anderes Land.",
    invalidResponse:
      "Die API-Antwort konnte nicht gelesen werden. Versuchen Sie es erneut.",
    timedOut:
      "Hugging Face hat nicht rechtzeitig geantwortet. Versuchen Sie es erneut.",
    connectionFailed:
      "Verbindung zur API fehlgeschlagen. Prüfen Sie die Internetverbindung und die Netzwerkeinschränkungen des Browsers.",
    noData:
      "Keine Daten verfügbar. Prüfen Sie, ob der Datensatz öffentlich zugänglich ist.",
    rowMissing:
      "An dieser Position sind keine Daten vorhanden. Der Datensatz wurde möglicherweise aktualisiert.",
    invalidRow: "Die Zeilendaten haben ein unerwartetes Format.",
    invalidAge: "Geben Sie das Alter als ganze Zahl zwischen 0 und 130 an.",
    invalidAgeRange:
      "Das Mindestalter darf das Höchstalter nicht überschreiten.",
    invalidSex: "Der Wert des Geschlechtsfilters ist ungültig.",
    revisionChangedDuringDraw:
      "Die Datensatzversion hat sich während der Anfrage geändert. Wiederholen Sie die Auswahl.",
    noMatch:
      "Unter den {count} geprüften Profilen wurde kein passendes gefunden. Erweitern Sie die Filter oder wiederholen Sie die Auswahl.",
    truncatedDraw:
      "Die API hat diese Zeile gekürzt. Wählen Sie ein anderes Profil aus.",
    splitsChanged:
      "Die verfügbaren Datensprachen haben sich geändert. Wählen Sie eine Sprache und wiederholen Sie die Auswahl.",
    invalidURL: "Der Profillink oder die Abfrageparameter sind ungültig.",
    invalidReplayDataset: "Der Wert dataset im Profillink ist ungültig.",
    invalidOffset:
      "Der Wert offset im Profillink muss eine ganze Zahl ab 0 sein.",
    invalidSplit: "Der Wert config oder split ist ungültig.",
    invalidRevision: "Der Wert rev im Profillink ist ungültig.",
    invalidUUID: "Die UUID im Profillink ist ungültig.",
    invalidView: "Das Ausgabeformat im Profillink ist ungültig.",
    replaySplitMissing:
      "Die Kombination config / split aus der URL ist in diesem Datensatz nicht mehr verfügbar.",
    offsetOutOfRange:
      "Der Wert offset liegt außerhalb des gültigen Bereichs von 0 bis {max}.",
    wrongRow:
      "Die API hat eine andere Zeilenposition zurückgegeben. Die Wiederherstellung wurde abgebrochen.",
    replayRevisionMismatch:
      "Die Datensatzversion weicht von der URL ab. Die Wiederherstellung wurde abgebrochen, da sich der Inhalt geändert haben könnte. Verwenden Sie eine gespeicherte Text- oder JSON-Datei.",
    replayRevisionMissing:
      "Die API hat keine Datensatzversion geliefert. Die Wiederherstellung wurde abgebrochen.",
    replayUUIDMismatch:
      "Die UUID des Profils weicht von der URL ab. Die Wiederherstellung wurde abgebrochen, damit kein anderes Profil angezeigt wird.",
    truncatedReplay:
      "Die API hat diese Zeile gekürzt. Die Wiederherstellung wurde abgebrochen.",
  },
  it: {
    invalidCount: "Il numero di righe disponibili non è valido.",
    invalidDataset: "Seleziona un insieme di dati NVIDIA Nemotron Personas.",
    rateLimited:
      "È stato raggiunto il limite di richieste di Hugging Face. Attendi un momento e riprova.",
    httpError:
      "Impossibile recuperare i dati da Hugging Face (HTTP {status}). Riprova o seleziona un altro paese.",
    invalidResponse: "Impossibile leggere la risposta dell’API. Riprova.",
    timedOut: "Hugging Face non ha risposto in tempo. Riprova.",
    connectionFailed:
      "Impossibile connettersi all’API. Controlla la connessione internet e le restrizioni di rete del browser.",
    noData:
      "Nessun dato disponibile. Verifica che l’insieme di dati sia accessibile al pubblico.",
    rowMissing:
      "Non ci sono dati in questa posizione. L’insieme di dati potrebbe essere stato aggiornato.",
    invalidRow: "I dati della riga hanno un formato inatteso.",
    invalidAge: "Inserisci un’età intera tra 0 e 130.",
    invalidAgeRange: "L’età minima non può superare l’età massima.",
    invalidSex: "Il valore del filtro per sesso non è valido.",
    revisionChangedDuringDraw:
      "La versione dei dati è cambiata durante la richiesta. Ripeti l’estrazione.",
    noMatch:
      "Nessuno dei {count} profili controllati corrisponde ai criteri. Amplia i filtri o ripeti l’estrazione.",
    truncatedDraw: "L’API ha troncato questa riga. Estrai un altro profilo.",
    splitsChanged:
      "Le lingue disponibili sono cambiate. Seleziona una lingua e ripeti l’estrazione.",
    invalidURL: "Il link del profilo o i parametri di ricerca non sono validi.",
    invalidReplayDataset:
      "Il valore dataset nel link del profilo non è valido.",
    invalidOffset:
      "Il valore offset nel link del profilo deve essere un numero intero non negativo.",
    invalidSplit: "Il valore config o split non è valido.",
    invalidRevision: "Il valore rev nel link del profilo non è valido.",
    invalidUUID: "L’UUID nel link del profilo non è valido.",
    invalidView: "Il formato di uscita nel link del profilo non è valido.",
    replaySplitMissing:
      "La combinazione config / split dell’URL non è più disponibile in questi dati.",
    offsetOutOfRange:
      "Il valore offset è fuori intervallo. L’intervallo attuale va da 0 a {max}.",
    wrongRow:
      "L’API ha restituito una riga in un’altra posizione. Il ripristino è stato interrotto.",
    replayRevisionMismatch:
      "La versione dei dati non corrisponde a quella dell’URL. Il ripristino è stato interrotto perché il contenuto potrebbe essere cambiato. Usa un file di testo o JSON salvato.",
    replayRevisionMissing:
      "L’API non ha fornito la versione dei dati. Il ripristino è stato interrotto.",
    replayUUIDMismatch:
      "L’UUID del profilo non corrisponde a quello dell’URL. Il ripristino è stato interrotto per evitare di mostrare un altro profilo.",
    truncatedReplay:
      "L’API ha troncato questa riga. Il ripristino è stato interrotto.",
  },
  nl: {
    invalidCount: "Het aantal beschikbare rijen is ongeldig.",
    invalidDataset:
      "Selecteer een gegevensverzameling van NVIDIA Nemotron Personas.",
    rateLimited:
      "De aanvraaglimiet van Hugging Face is bereikt. Wacht even en probeer opnieuw.",
    httpError:
      "Gegevens ophalen van Hugging Face is mislukt (HTTP {status}). Probeer opnieuw of kies een ander land.",
    invalidResponse: "De API-reactie kon niet worden gelezen. Probeer opnieuw.",
    timedOut: "Hugging Face reageerde niet op tijd. Probeer opnieuw.",
    connectionFailed:
      "Verbinding met de API is mislukt. Controleer de internetverbinding en de netwerkbeperkingen van de browser.",
    noData:
      "Er zijn geen gegevens beschikbaar. Controleer of de gegevensverzameling openbaar toegankelijk is.",
    rowMissing:
      "Op deze positie staan geen gegevens. De gegevensverzameling is mogelijk bijgewerkt.",
    invalidRow: "De rijgegevens hebben een onverwacht formaat.",
    invalidAge: "Voer een leeftijd in als geheel getal van 0 tot en met 130.",
    invalidAgeRange:
      "De minimumleeftijd mag niet hoger zijn dan de maximumleeftijd.",
    invalidSex: "De waarde van het geslachtsfilter is ongeldig.",
    revisionChangedDuringDraw:
      "De gegevensversie veranderde tijdens de aanvraag. Kies opnieuw een profiel.",
    noMatch:
      "Geen van de {count} bekeken profielen voldoet aan de voorwaarden. Verruim de filters of kies opnieuw.",
    truncatedDraw: "De API heeft deze rij afgekapt. Kies een ander profiel.",
    splitsChanged:
      "De beschikbare gegevenstalen zijn gewijzigd. Selecteer een taal en kies opnieuw.",
    invalidURL: "De profiellink of de zoekparameters zijn ongeldig.",
    invalidReplayDataset: "De waarde dataset in de profiellink is ongeldig.",
    invalidOffset:
      "De waarde offset in de profiellink moet een geheel getal vanaf 0 zijn.",
    invalidSplit: "De waarde config of split is ongeldig.",
    invalidRevision: "De waarde rev in de profiellink is ongeldig.",
    invalidUUID: "De UUID in de profiellink is ongeldig.",
    invalidView: "Het uitvoerformaat in de profiellink is ongeldig.",
    replaySplitMissing:
      "De combinatie config / split uit de URL is niet meer beschikbaar in deze gegevensverzameling.",
    offsetOutOfRange:
      "De waarde offset valt buiten het bereik. Het huidige bereik is 0 tot en met {max}.",
    wrongRow:
      "De API gaf een andere rijpositie terug. Het herstellen is gestopt.",
    replayRevisionMismatch:
      "De gegevensversie wijkt af van de URL. Het herstellen is gestopt omdat de inhoud kan zijn veranderd. Gebruik een opgeslagen tekst- of JSON-bestand.",
    replayRevisionMissing:
      "De API heeft geen gegevensversie verstrekt. Het herstellen is gestopt.",
    replayUUIDMismatch:
      "De UUID van het profiel wijkt af van de URL. Het herstellen is gestopt om te voorkomen dat een ander profiel wordt getoond.",
    truncatedReplay:
      "De API heeft deze rij afgekapt. Het herstellen is gestopt.",
  },
  ru: {
    invalidCount: "Недопустимое количество доступных строк.",
    invalidDataset: "Выберите набор данных NVIDIA Nemotron Personas.",
    rateLimited:
      "Достигнут лимит запросов Hugging Face. Немного подождите и повторите попытку.",
    httpError:
      "Не удалось получить данные из Hugging Face (HTTP {status}). Повторите попытку или выберите другую страну.",
    invalidResponse: "Не удалось прочитать ответ API. Повторите попытку.",
    timedOut: "Hugging Face не ответил вовремя. Повторите попытку.",
    connectionFailed:
      "Не удалось подключиться к API. Проверьте интернет-соединение и сетевые ограничения браузера.",
    noData:
      "Данные недоступны. Проверьте, открыт ли публичный доступ к набору данных.",
    rowMissing:
      "По указанной позиции нет данных. Возможно, набор данных обновился.",
    invalidRow: "Неожиданный формат данных строки.",
    invalidAge: "Укажите возраст целым числом от 0 до 130.",
    invalidAgeRange: "Минимальный возраст не должен превышать максимальный.",
    invalidSex: "Недопустимое значение фильтра пола.",
    revisionChangedDuringDraw:
      "Во время запроса версия набора данных изменилась. Повторите выбор.",
    noMatch:
      "Среди проверенных кандидатов ({count}) не найден подходящий персонаж. Ослабьте фильтры или повторите выбор.",
    truncatedDraw:
      "API обрезал содержимое этой строки. Выберите другого персонажа.",
    splitsChanged:
      "Список языков данных изменился. Выберите язык и повторите выбор.",
    invalidURL: "Недопустимая ссылка на профиль или строка параметров.",
    invalidReplayDataset: "Недопустимое значение dataset в ссылке на профиль.",
    invalidOffset:
      "Значение offset в ссылке на профиль должно быть целым неотрицательным числом.",
    invalidSplit: "Недопустимое значение config или split.",
    invalidRevision: "Недопустимое значение rev в ссылке на профиль.",
    invalidUUID: "Недопустимый UUID в ссылке на профиль.",
    invalidView: "Недопустимый формат вывода в ссылке на профиль.",
    replaySplitMissing:
      "Указанная в URL комбинация config / split больше недоступна в этом наборе данных.",
    offsetOutOfRange:
      "Значение offset вне диапазона. Сейчас допустимы значения от 0 до {max}.",
    wrongRow:
      "API вернул строку с другой позицией. Восстановление остановлено.",
    replayRevisionMismatch:
      "Версия набора данных отличается от записанной в URL. Восстановление остановлено, так как содержимое могло измениться. Используйте сохранённый текстовый файл или JSON.",
    replayRevisionMissing:
      "API не предоставил версию набора данных. Восстановление остановлено.",
    replayUUIDMismatch:
      "UUID персонажа отличается от записанного в URL. Восстановление остановлено, чтобы не показать другого персонажа.",
    truncatedReplay:
      "API обрезал содержимое этой строки. Восстановление остановлено.",
  },
  uk: {
    invalidCount: "Неприпустима кількість доступних рядків.",
    invalidDataset: "Виберіть набір даних NVIDIA Nemotron Personas.",
    rateLimited:
      "Досягнуто ліміту запитів Hugging Face. Трохи зачекайте й повторіть спробу.",
    httpError:
      "Не вдалося отримати дані з Hugging Face (HTTP {status}). Повторіть спробу або виберіть іншу країну.",
    invalidResponse: "Не вдалося прочитати відповідь API. Повторіть спробу.",
    timedOut: "Hugging Face не відповів вчасно. Повторіть спробу.",
    connectionFailed:
      "Не вдалося підключитися до API. Перевірте інтернет-з’єднання та мережеві обмеження браузера.",
    noData:
      "Дані недоступні. Перевірте, чи відкрито публічний доступ до набору даних.",
    rowMissing:
      "За вказаною позицією немає даних. Можливо, набір даних оновлено.",
    invalidRow: "Неочікуваний формат даних рядка.",
    invalidAge: "Укажіть вік цілим числом від 0 до 130.",
    invalidAgeRange: "Мінімальний вік не має перевищувати максимальний.",
    invalidSex: "Неприпустиме значення фільтра статі.",
    revisionChangedDuringDraw:
      "Під час запиту версія набору даних змінилася. Повторіть вибір.",
    noMatch:
      "Серед перевірених кандидатів ({count}) не знайдено відповідного персонажа. Послабте фільтри або повторіть вибір.",
    truncatedDraw: "API обрізав вміст цього рядка. Оберіть іншого персонажа.",
    splitsChanged:
      "Перелік мов даних змінився. Виберіть мову та повторіть вибір.",
    invalidURL: "Неприпустиме посилання на профіль або рядок параметрів.",
    invalidReplayDataset:
      "Неприпустиме значення dataset у посиланні на профіль.",
    invalidOffset:
      "Значення offset у посиланні на профіль має бути цілим невід’ємним числом.",
    invalidSplit: "Неприпустиме значення config або split.",
    invalidRevision: "Неприпустиме значення rev у посиланні на профіль.",
    invalidUUID: "Неприпустимий UUID у посиланні на профіль.",
    invalidView: "Неприпустимий формат виводу в посиланні на профіль.",
    replaySplitMissing:
      "Комбінація config / split з URL більше недоступна в цьому наборі даних.",
    offsetOutOfRange:
      "Значення offset поза діапазоном. Поточний діапазон — від 0 до {max}.",
    wrongRow: "API повернув рядок з іншою позицією. Відновлення зупинено.",
    replayRevisionMismatch:
      "Версія набору даних відрізняється від записаної в URL. Відновлення зупинено, оскільки вміст міг змінитися. Скористайтеся збереженим текстовим файлом або JSON.",
    replayRevisionMissing:
      "API не надав версію набору даних. Відновлення зупинено.",
    replayUUIDMismatch:
      "UUID персонажа відрізняється від записаного в URL. Відновлення зупинено, щоб не показати іншого персонажа.",
    truncatedReplay: "API обрізав вміст цього рядка. Відновлення зупинено.",
  },
  pl: {
    invalidCount: "Nieprawidłowa liczba dostępnych wierszy.",
    invalidDataset: "Wybierz zbiór danych NVIDIA Nemotron Personas.",
    rateLimited:
      "Osiągnięto limit zapytań Hugging Face. Poczekaj chwilę i spróbuj ponownie.",
    httpError:
      "Nie udało się pobrać danych z Hugging Face (HTTP {status}). Spróbuj ponownie lub wybierz inny kraj.",
    invalidResponse: "Nie udało się odczytać odpowiedzi API. Spróbuj ponownie.",
    timedOut: "Hugging Face nie odpowiedział na czas. Spróbuj ponownie.",
    connectionFailed:
      "Nie udało się połączyć z API. Sprawdź połączenie internetowe i ograniczenia sieciowe przeglądarki.",
    noData:
      "Brak dostępnych danych. Sprawdź, czy zbiór danych jest publicznie dostępny.",
    rowMissing:
      "Brak danych na wskazanej pozycji. Zbiór danych mógł zostać zaktualizowany.",
    invalidRow: "Dane wiersza mają nieoczekiwany format.",
    invalidAge: "Podaj wiek jako liczbę całkowitą od 0 do 130.",
    invalidAgeRange: "Minimalny wiek nie może przekraczać maksymalnego.",
    invalidSex: "Nieprawidłowa wartość filtra płci.",
    revisionChangedDuringDraw:
      "Wersja zbioru danych zmieniła się podczas zapytania. Powtórz losowanie.",
    noMatch:
      "Nie znaleziono pasującej postaci wśród sprawdzonych kandydatów ({count}). Złagodź filtry lub powtórz losowanie.",
    truncatedDraw: "API ucięło zawartość tego wiersza. Wylosuj inną postać.",
    splitsChanged:
      "Dostępne języki danych uległy zmianie. Wybierz język i powtórz losowanie.",
    invalidURL: "Link do profilu lub ciąg parametrów jest nieprawidłowy.",
    invalidReplayDataset:
      "Wartość dataset w linku do profilu jest nieprawidłowa.",
    invalidOffset:
      "Wartość offset w linku do profilu musi być nieujemną liczbą całkowitą.",
    invalidSplit: "Wartość config lub split jest nieprawidłowa.",
    invalidRevision: "Wartość rev w linku do profilu jest nieprawidłowa.",
    invalidUUID: "UUID w linku do profilu jest nieprawidłowy.",
    invalidView: "Format wyjściowy w linku do profilu jest nieprawidłowy.",
    replaySplitMissing:
      "Kombinacja config / split z adresu URL nie jest już dostępna w tym zbiorze danych.",
    offsetOutOfRange:
      "Wartość offset jest poza zakresem. Aktualny zakres wynosi od 0 do {max}.",
    wrongRow:
      "API zwróciło wiersz z innej pozycji. Odtwarzanie zostało zatrzymane.",
    replayRevisionMismatch:
      "Wersja zbioru danych różni się od zapisanej w adresie URL. Odtwarzanie zatrzymano, ponieważ treść mogła ulec zmianie. Użyj zapisanego pliku tekstowego lub JSON.",
    replayRevisionMissing:
      "API nie podało wersji zbioru danych. Odtwarzanie zostało zatrzymane.",
    replayUUIDMismatch:
      "UUID postaci różni się od zapisanego w adresie URL. Odtwarzanie zatrzymano, aby uniknąć wyświetlenia innej postaci.",
    truncatedReplay:
      "API ucięło zawartość tego wiersza. Odtwarzanie zostało zatrzymane.",
  },
  cs: {
    invalidCount: "Počet dostupných řádků je neplatný.",
    invalidDataset: "Vyberte datovou sadu NVIDIA Nemotron Personas.",
    rateLimited:
      "Byl dosažen limit požadavků Hugging Face. Chvíli počkejte a zkuste to znovu.",
    httpError:
      "Data z Hugging Face se nepodařilo získat (HTTP {status}). Zkuste to znovu nebo vyberte jinou zemi.",
    invalidResponse: "Odpověď API se nepodařilo přečíst. Zkuste to znovu.",
    timedOut: "Hugging Face neodpověděl včas. Zkuste to znovu.",
    connectionFailed:
      "Připojení k API se nezdařilo. Zkontrolujte internetové připojení a síťová omezení prohlížeče.",
    noData:
      "Nejsou dostupná žádná data. Ověřte, zda je datová sada veřejně přístupná.",
    rowMissing:
      "Na zadané pozici nejsou žádná data. Datová sada mohla být aktualizována.",
    invalidRow: "Data řádku mají neočekávaný formát.",
    invalidAge: "Zadejte věk jako celé číslo od 0 do 130.",
    invalidAgeRange: "Minimální věk nesmí být vyšší než maximální.",
    invalidSex: "Hodnota filtru pohlaví je neplatná.",
    revisionChangedDuringDraw:
      "Verze datové sady se během požadavku změnila. Zopakujte výběr.",
    noMatch:
      "Mezi prověřenými kandidáty ({count}) nebyla nalezena vyhovující postava. Zmírněte filtry nebo zopakujte výběr.",
    truncatedDraw: "API zkrátilo obsah tohoto řádku. Vyberte jinou postavu.",
    splitsChanged:
      "Dostupné jazyky dat se změnily. Vyberte jazyk a zopakujte výběr.",
    invalidURL: "Odkaz na profil nebo řetězec parametrů je neplatný.",
    invalidReplayDataset: "Hodnota dataset v odkazu na profil je neplatná.",
    invalidOffset:
      "Hodnota offset v odkazu na profil musí být nezáporné celé číslo.",
    invalidSplit: "Hodnota config nebo split je neplatná.",
    invalidRevision: "Hodnota rev v odkazu na profil je neplatná.",
    invalidUUID: "UUID v odkazu na profil je neplatné.",
    invalidView: "Výstupní formát v odkazu na profil je neplatný.",
    replaySplitMissing:
      "Kombinace config / split z URL již není v této datové sadě dostupná.",
    offsetOutOfRange:
      "Hodnota offset je mimo rozsah. Aktuální rozsah je od 0 do {max}.",
    wrongRow: "API vrátilo řádek z jiné pozice. Obnovení bylo zastaveno.",
    replayRevisionMismatch:
      "Verze datové sady se liší od záznamu v URL. Obnovení bylo zastaveno, protože se obsah mohl změnit. Použijte uložený textový soubor nebo JSON.",
    replayRevisionMissing:
      "API neposkytlo verzi datové sady. Obnovení bylo zastaveno.",
    replayUUIDMismatch:
      "UUID postavy se liší od záznamu v URL. Obnovení bylo zastaveno, aby se nezobrazila jiná postava.",
    truncatedReplay:
      "API zkrátilo obsah tohoto řádku. Obnovení bylo zastaveno.",
  },
  sk: {
    invalidCount: "Počet dostupných riadkov je neplatný.",
    invalidDataset: "Vyberte súbor údajov NVIDIA Nemotron Personas.",
    rateLimited:
      "Bol dosiahnutý limit požiadaviek Hugging Face. Chvíľu počkajte a skúste to znova.",
    httpError:
      "Údaje z Hugging Face sa nepodarilo získať (HTTP {status}). Skúste to znova alebo vyberte inú krajinu.",
    invalidResponse: "Odpoveď API sa nepodarilo prečítať. Skúste to znova.",
    timedOut: "Hugging Face neodpovedal včas. Skúste to znova.",
    connectionFailed:
      "Pripojenie k API zlyhalo. Skontrolujte internetové pripojenie a sieťové obmedzenia prehliadača.",
    noData:
      "Nie sú dostupné žiadne údaje. Overte, či je súbor údajov verejne prístupný.",
    rowMissing:
      "Na zadanej pozícii nie sú údaje. Súbor údajov mohol byť aktualizovaný.",
    invalidRow: "Údaje riadka majú neočakávaný formát.",
    invalidAge: "Zadajte vek ako celé číslo od 0 do 130.",
    invalidAgeRange: "Minimálny vek nesmie byť vyšší než maximálny.",
    invalidSex: "Hodnota filtra pohlavia je neplatná.",
    revisionChangedDuringDraw:
      "Verzia súboru údajov sa počas požiadavky zmenila. Zopakujte výber.",
    noMatch:
      "Medzi preverenými kandidátmi ({count}) sa nenašla vyhovujúca postava. Zmiernite filtre alebo zopakujte výber.",
    truncatedDraw: "API skrátilo obsah tohto riadka. Vyberte inú postavu.",
    splitsChanged:
      "Dostupné jazyky údajov sa zmenili. Vyberte jazyk a zopakujte výber.",
    invalidURL: "Odkaz na profil alebo reťazec parametrov je neplatný.",
    invalidReplayDataset: "Hodnota dataset v odkaze na profil je neplatná.",
    invalidOffset:
      "Hodnota offset v odkaze na profil musí byť nezáporné celé číslo.",
    invalidSplit: "Hodnota config alebo split je neplatná.",
    invalidRevision: "Hodnota rev v odkaze na profil je neplatná.",
    invalidUUID: "UUID v odkaze na profil je neplatné.",
    invalidView: "Výstupný formát v odkaze na profil je neplatný.",
    replaySplitMissing:
      "Kombinácia config / split z URL už nie je v tomto súbore údajov dostupná.",
    offsetOutOfRange:
      "Hodnota offset je mimo rozsahu. Aktuálny rozsah je od 0 do {max}.",
    wrongRow: "API vrátilo riadok z inej pozície. Obnovenie bolo zastavené.",
    replayRevisionMismatch:
      "Verzia súboru údajov sa líši od záznamu v URL. Obnovenie bolo zastavené, pretože sa obsah mohol zmeniť. Použite uložený textový súbor alebo JSON.",
    replayRevisionMissing:
      "API neposkytlo verziu súboru údajov. Obnovenie bolo zastavené.",
    replayUUIDMismatch:
      "UUID postavy sa líši od záznamu v URL. Obnovenie bolo zastavené, aby sa nezobrazila iná postava.",
    truncatedReplay:
      "API skrátilo obsah tohto riadka. Obnovenie bolo zastavené.",
  },
  ro: {
    invalidCount: "Numărul de rânduri disponibile nu este valid.",
    invalidDataset: "Selectează un set de date NVIDIA Nemotron Personas.",
    rateLimited:
      "A fost atinsă limita de cereri Hugging Face. Așteaptă puțin și încearcă din nou.",
    httpError:
      "Datele nu au putut fi obținute de la Hugging Face (HTTP {status}). Încearcă din nou sau selectează altă țară.",
    invalidResponse: "Răspunsul API nu a putut fi citit. Încearcă din nou.",
    timedOut: "Hugging Face nu a răspuns la timp. Încearcă din nou.",
    connectionFailed:
      "Conectarea la API a eșuat. Verifică legătura la internet și restricțiile de rețea ale browserului.",
    noData:
      "Nu sunt date disponibile. Verifică dacă setul de date este accesibil public.",
    rowMissing:
      "Nu există date la poziția indicată. Este posibil ca setul de date să fi fost actualizat.",
    invalidRow: "Datele rândului au un format neașteptat.",
    invalidAge: "Introdu vârsta ca număr întreg între 0 și 130.",
    invalidAgeRange: "Vârsta minimă nu poate depăși vârsta maximă.",
    invalidSex: "Valoarea filtrului de sex nu este validă.",
    revisionChangedDuringDraw:
      "Versiunea setului de date s-a schimbat în timpul cererii. Repetă selecția.",
    noMatch:
      "Nu a fost găsit un personaj potrivit printre candidații verificați ({count}). Lărgește filtrele sau repetă selecția.",
    truncatedDraw: "API-ul a trunchiat acest rând. Alege alt personaj.",
    splitsChanged:
      "Limbile disponibile pentru date s-au schimbat. Selectează o limbă și repetă selecția.",
    invalidURL: "Linkul profilului sau șirul de parametri nu este valid.",
    invalidReplayDataset:
      "Valoarea dataset din linkul profilului nu este validă.",
    invalidOffset:
      "Valoarea offset din linkul profilului trebuie să fie un număr întreg nenegativ.",
    invalidSplit: "Valoarea config sau split nu este validă.",
    invalidRevision: "Valoarea rev din linkul profilului nu este validă.",
    invalidUUID: "UUID din linkul profilului nu este valid.",
    invalidView: "Formatul de ieșire din linkul profilului nu este valid.",
    replaySplitMissing:
      "Combinația config / split din URL nu mai este disponibilă în acest set de date.",
    offsetOutOfRange:
      "Valoarea offset este în afara intervalului. Intervalul actual este de la 0 la {max}.",
    wrongRow:
      "API-ul a returnat un rând de la altă poziție. Restaurarea a fost oprită.",
    replayRevisionMismatch:
      "Versiunea setului de date diferă de cea din URL. Restaurarea a fost oprită deoarece conținutul s-ar fi putut schimba. Folosește un fișier text sau JSON salvat.",
    replayRevisionMissing:
      "API-ul nu a furnizat versiunea setului de date. Restaurarea a fost oprită.",
    replayUUIDMismatch:
      "UUID al personajului diferă de cel din URL. Restaurarea a fost oprită pentru a evita afișarea altui personaj.",
    truncatedReplay:
      "API-ul a trunchiat acest rând. Restaurarea a fost oprită.",
  },
  hu: {
    invalidCount: "Az elérhető sorok száma érvénytelen.",
    invalidDataset: "Válasszon egy NVIDIA Nemotron Personas adatkészletet.",
    rateLimited:
      "Elérte a Hugging Face kérési korlátját. Várjon egy kicsit, majd próbálja újra.",
    httpError:
      "Nem sikerült adatot lekérni a Hugging Face oldaláról (HTTP {status}). Próbálja újra, vagy válasszon másik országot.",
    invalidResponse: "Az API válasza nem olvasható. Próbálja újra.",
    timedOut: "A Hugging Face nem válaszolt időben. Próbálja újra.",
    connectionFailed:
      "Nem sikerült kapcsolódni az API-hoz. Ellenőrizze az internetkapcsolatot és a böngésző hálózati korlátozásait.",
    noData:
      "Nincs elérhető adat. Ellenőrizze, hogy az adatkészlet nyilvánosan hozzáférhető-e.",
    rowMissing:
      "A megadott helyen nincs adat. Lehetséges, hogy az adatkészlet frissült.",
    invalidRow: "A sor adatainak formátuma eltér a várttól.",
    invalidAge: "Az életkort 0 és 130 közötti egész számként adja meg.",
    invalidAgeRange: "A legkisebb életkor nem lehet nagyobb a legnagyobbnál.",
    invalidSex: "A nem szerinti szűrő értéke érvénytelen.",
    revisionChangedDuringDraw:
      "Az adatkészlet verziója a kérés közben megváltozott. Ismételje meg a kiválasztást.",
    noMatch:
      "A megvizsgált {count} jelölt között nem volt megfelelő szereplő. Enyhítse a szűrőket, vagy ismételje meg a kiválasztást.",
    truncatedDraw: "Az API csonkolta ezt a sort. Válasszon másik szereplőt.",
    splitsChanged:
      "Az elérhető adatnyelvek megváltoztak. Válasszon nyelvet, és ismételje meg a kiválasztást.",
    invalidURL:
      "A profil hivatkozása vagy a lekérdezési paraméterek érvénytelenek.",
    invalidReplayDataset:
      "A profil hivatkozásában szereplő dataset érték érvénytelen.",
    invalidOffset:
      "A profil hivatkozásában szereplő offset értéknek nemnegatív egész számnak kell lennie.",
    invalidSplit: "A config vagy split érték érvénytelen.",
    invalidRevision: "A profil hivatkozásában szereplő rev érték érvénytelen.",
    invalidUUID: "A profil hivatkozásában szereplő UUID érvénytelen.",
    invalidView:
      "A profil hivatkozásában szereplő kimeneti formátum érvénytelen.",
    replaySplitMissing:
      "Az URL-ben szereplő config / split kombináció már nem érhető el ebben az adatkészletben.",
    offsetOutOfRange:
      "Az offset érték tartományon kívül van. A jelenlegi tartomány: 0–{max}.",
    wrongRow:
      "Az API másik helyen lévő sort adott vissza. A visszaállítás leállt.",
    replayRevisionMismatch:
      "Az adatkészlet verziója eltér az URL-ben rögzítettől. A visszaállítás leállt, mert a tartalom megváltozhatott. Használjon mentett szöveg- vagy JSON-fájlt.",
    replayRevisionMissing:
      "Az API nem adta meg az adatkészlet verzióját. A visszaállítás leállt.",
    replayUUIDMismatch:
      "A szereplő UUID-ja eltér az URL-ben rögzítettől. A visszaállítás leállt, nehogy másik szereplő jelenjen meg.",
    truncatedReplay: "Az API csonkolta ezt a sort. A visszaállítás leállt.",
  },
  bg: {
    invalidCount: "Броят на наличните редове е невалиден.",
    invalidDataset: "Изберете набор от данни NVIDIA Nemotron Personas.",
    rateLimited:
      "Достигнат е лимитът за заявки на Hugging Face. Изчакайте малко и опитайте отново.",
    httpError:
      "Данните не можаха да се получат от Hugging Face (HTTP {status}). Опитайте отново или изберете друга държава.",
    invalidResponse: "Отговорът на API не можа да се прочете. Опитайте отново.",
    timedOut: "Hugging Face не отговори навреме. Опитайте отново.",
    connectionFailed:
      "Връзката с API е неуспешна. Проверете интернет връзката и мрежовите ограничения на браузъра.",
    noData:
      "Няма налични данни. Проверете дали наборът от данни е публично достъпен.",
    rowMissing:
      "На указаната позиция няма данни. Възможно е наборът от данни да е обновен.",
    invalidRow: "Данните в реда са в неочакван формат.",
    invalidAge: "Въведете възрастта като цяло число от 0 до 130.",
    invalidAgeRange: "Минималната възраст не може да надвишава максималната.",
    invalidSex: "Стойността на филтъра за пол е невалидна.",
    revisionChangedDuringDraw:
      "Версията на набора от данни се промени по време на заявката. Повторете избора.",
    noMatch:
      "Сред проверените кандидати ({count}) не е намерен подходящ персонаж. Разширете филтрите или повторете избора.",
    truncatedDraw:
      "API е съкратил съдържанието на този ред. Изберете друг персонаж.",
    splitsChanged:
      "Наличните езици на данните са променени. Изберете език и повторете избора.",
    invalidURL: "Връзката към профила или низът с параметри е невалиден.",
    invalidReplayDataset:
      "Стойността dataset във връзката към профила е невалидна.",
    invalidOffset:
      "Стойността offset във връзката към профила трябва да е неотрицателно цяло число.",
    invalidSplit: "Стойността config или split е невалидна.",
    invalidRevision: "Стойността rev във връзката към профила е невалидна.",
    invalidUUID: "UUID във връзката към профила е невалиден.",
    invalidView: "Изходният формат във връзката към профила е невалиден.",
    replaySplitMissing:
      "Комбинацията config / split от URL вече не е налична в този набор от данни.",
    offsetOutOfRange:
      "Стойността offset е извън обхвата. Текущият обхват е от 0 до {max}.",
    wrongRow: "API върна ред на друга позиция. Възстановяването е спряно.",
    replayRevisionMismatch:
      "Версията на набора от данни се различава от записаната в URL. Възстановяването е спряно, защото съдържанието може да е променено. Използвайте запазен текстов или JSON файл.",
    replayRevisionMissing:
      "API не предостави версия на набора от данни. Възстановяването е спряно.",
    replayUUIDMismatch:
      "UUID на персонажа се различава от записания в URL. Възстановяването е спряно, за да не се покаже друг персонаж.",
    truncatedReplay:
      "API е съкратил съдържанието на този ред. Възстановяването е спряно.",
  },
  el: {
    invalidCount: "Ο αριθμός των διαθέσιμων γραμμών δεν είναι έγκυρος.",
    invalidDataset: "Επιλέξτε ένα σύνολο δεδομένων NVIDIA Nemotron Personas.",
    rateLimited:
      "Το Hugging Face περιόρισε τον ρυθμό των αιτημάτων. Περιμένετε λίγο και δοκιμάστε ξανά.",
    httpError:
      "Δεν ήταν δυνατή η ανάκτηση από το Hugging Face (HTTP {status}). Δοκιμάστε ξανά ή επιλέξτε άλλη χώρα.",
    invalidResponse:
      "Δεν ήταν δυνατή η ανάγνωση της απόκρισης του API. Δοκιμάστε ξανά.",
    timedOut: "Το Hugging Face δεν απάντησε εγκαίρως. Δοκιμάστε ξανά.",
    connectionFailed:
      "Δεν ήταν δυνατή η σύνδεση με το API. Ελέγξτε τη σύνδεσή σας στο διαδίκτυο και τους περιορισμούς δικτύου του προγράμματος περιήγησης.",
    noData:
      "Δεν υπάρχουν διαθέσιμα δεδομένα. Ελέγξτε αν το σύνολο δεδομένων είναι δημόσια προσβάσιμο.",
    rowMissing:
      "Δεν υπάρχουν δεδομένα σε αυτή τη θέση. Το σύνολο δεδομένων ενδέχεται να έχει ενημερωθεί.",
    invalidRow: "Τα δεδομένα της γραμμής έχουν μη αναμενόμενη μορφή.",
    invalidAge: "Εισαγάγετε την ηλικία ως ακέραιο αριθμό από 0 έως 130.",
    invalidAgeRange: "Η ελάχιστη ηλικία δεν μπορεί να υπερβαίνει τη μέγιστη.",
    invalidSex: "Η τιμή του φίλτρου φύλου δεν είναι έγκυρη.",
    revisionChangedDuringDraw:
      "Η έκδοση του συνόλου δεδομένων άλλαξε κατά τη διάρκεια του αιτήματος. Κάντε νέα επιλογή.",
    noMatch:
      "Δεν βρέθηκε κατάλληλο πρόσωπο ανάμεσα στα {count} που ελέγχθηκαν. Διευρύνετε τα φίλτρα ή κάντε νέα επιλογή.",
    truncatedDraw: "Το API περιέκοψε αυτή τη γραμμή. Επιλέξτε άλλο πρόσωπο.",
    splitsChanged:
      "Οι διαθέσιμες γλώσσες δεδομένων άλλαξαν. Επιλέξτε γλώσσα και κάντε νέα επιλογή.",
    invalidURL:
      "Το URL επαναπροβολής ή η συμβολοσειρά ερωτήματος δεν είναι έγκυρα.",
    invalidReplayDataset:
      "Το σύνολο δεδομένων στο URL επαναπροβολής δεν είναι έγκυρο.",
    invalidOffset:
      "Η τιμή offset για την επαναπροβολή πρέπει να είναι μη αρνητικός ακέραιος.",
    invalidSplit: "Το config ή το split δεν είναι έγκυρο.",
    invalidRevision: "Η τιμή rev στο URL επαναπροβολής δεν είναι έγκυρη.",
    invalidUUID: "Το UUID στο URL επαναπροβολής δεν είναι έγκυρο.",
    invalidView: "Η μορφή εξόδου στο URL επαναπροβολής δεν είναι έγκυρη.",
    replaySplitMissing:
      "Το config / split του URL δεν είναι πλέον διαθέσιμο σε αυτό το σύνολο δεδομένων.",
    offsetOutOfRange:
      "Η τιμή offset είναι εκτός ορίων. Το τρέχον εύρος είναι από 0 έως {max}.",
    wrongRow:
      "Το API επέστρεψε διαφορετική θέση γραμμής. Η επαναπροβολή διακόπηκε.",
    replayRevisionMismatch:
      "Η έκδοση του συνόλου δεδομένων διαφέρει από εκείνη του URL. Η επαναπροβολή διακόπηκε επειδή το περιεχόμενο μπορεί να έχει αλλάξει. Χρησιμοποιήστε ένα αποθηκευμένο αρχείο κειμένου ή JSON.",
    replayRevisionMissing:
      "Το API δεν παρείχε την έκδοση του συνόλου δεδομένων. Η επαναπροβολή διακόπηκε.",
    replayUUIDMismatch:
      "Το UUID του προσώπου διαφέρει από εκείνο του URL. Η επαναπροβολή διακόπηκε για να μην εμφανιστεί διαφορετικό πρόσωπο.",
    truncatedReplay:
      "Το API περιέκοψε αυτή τη γραμμή. Η επαναπροβολή διακόπηκε.",
  },
  tr: {
    invalidCount: "Kullanılabilir satır sayısı geçersiz.",
    invalidDataset: "Bir NVIDIA Nemotron Personas veri kümesi seçin.",
    rateLimited:
      "Hugging Face istek hızını sınırladı. Biraz bekleyip yeniden deneyin.",
    httpError:
      "Hugging Face üzerinden veriler alınamadı (HTTP {status}). Yeniden deneyin veya başka bir ülke seçin.",
    invalidResponse: "API yanıtı okunamadı. Yeniden deneyin.",
    timedOut: "Hugging Face zamanında yanıt vermedi. Yeniden deneyin.",
    connectionFailed:
      "API'ye bağlanılamadı. İnternet bağlantınızı ve tarayıcının ağ kısıtlamalarını kontrol edin.",
    noData:
      "Kullanılabilir veri yok. Veri kümesinin herkese açık olup olmadığını kontrol edin.",
    rowMissing: "Bu konumda veri yok. Veri kümesi güncellenmiş olabilir.",
    invalidRow: "Satır verileri beklenmeyen bir biçimde.",
    invalidAge: "Yaşı 0 ile 130 arasında bir tam sayı olarak girin.",
    invalidAgeRange: "En düşük yaş, en yüksek yaştan büyük olamaz.",
    invalidSex: "Cinsiyet filtresinin değeri geçersiz.",
    revisionChangedDuringDraw:
      "İstek sırasında veri kümesinin sürümü değişti. Yeniden seçim yapın.",
    noMatch:
      "İncelenen {count} aday arasında eşleşen bir kişi profili bulunamadı. Filtreleri genişletin veya yeniden seçim yapın.",
    truncatedDraw:
      "API bu satırın içeriğini kısalttı. Başka bir kişi profili seçin.",
    splitsChanged:
      "Kullanılabilir veri dilleri değişti. Bir dil seçip yeniden seçim yapın.",
    invalidURL: "Yeniden gösterim URL'si veya sorgu dizesi geçersiz.",
    invalidReplayDataset: "Yeniden gösterim URL'sindeki veri kümesi geçersiz.",
    invalidOffset:
      "Yeniden gösterim için offset, negatif olmayan bir tam sayı olmalıdır.",
    invalidSplit: "config veya split geçersiz.",
    invalidRevision: "Yeniden gösterim URL'sindeki rev değeri geçersiz.",
    invalidUUID: "Yeniden gösterim URL'sindeki UUID geçersiz.",
    invalidView: "Yeniden gösterim URL'sindeki çıktı biçimi geçersiz.",
    replaySplitMissing:
      "URL'deki config / split artık bu veri kümesinde bulunmuyor.",
    offsetOutOfRange:
      "offset aralık dışında. Mevcut aralık 0 ile {max} arasındadır.",
    wrongRow:
      "API farklı bir satır konumu döndürdü. Yeniden gösterim durduruldu.",
    replayRevisionMismatch:
      "Veri kümesinin sürümü URL'deki sürümden farklı. İçerik değişmiş olabileceği için yeniden gösterim durduruldu. Kaydedilmiş bir metin veya JSON dosyası kullanın.",
    replayRevisionMissing:
      "API veri kümesinin sürümünü belirtmedi. Yeniden gösterim durduruldu.",
    replayUUIDMismatch:
      "Kişinin UUID'si URL'dekinden farklı. Farklı bir kişinin gösterilmesini önlemek için yeniden gösterim durduruldu.",
    truncatedReplay:
      "API bu satırın içeriğini kısalttı. Yeniden gösterim durduruldu.",
  },
  sv: {
    invalidCount: "Antalet tillgängliga rader är ogiltigt.",
    invalidDataset: "Välj en datamängd från NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face har begränsat antalet anrop. Vänta en stund och försök igen.",
    httpError:
      "Kunde inte hämta från Hugging Face (HTTP {status}). Försök igen eller välj ett annat land.",
    invalidResponse: "API-svaret kunde inte läsas. Försök igen.",
    timedOut: "Hugging Face svarade inte i tid. Försök igen.",
    connectionFailed:
      "Kunde inte ansluta till API:et. Kontrollera internetanslutningen och webbläsarens nätverksbegränsningar.",
    noData:
      "Inga data är tillgängliga. Kontrollera om datamängden är offentligt tillgänglig.",
    rowMissing:
      "Det finns inga data på den positionen. Datamängden kan ha uppdaterats.",
    invalidRow: "Raddata har ett oväntat format.",
    invalidAge: "Ange åldern som ett heltal från 0 till 130.",
    invalidAgeRange: "Den lägsta åldern får inte överstiga den högsta.",
    invalidSex: "Värdet i könsfiltret är ogiltigt.",
    revisionChangedDuringDraw:
      "Datamängdens version ändrades under anropet. Gör ett nytt urval.",
    noMatch:
      "Ingen passande person hittades bland de {count} kandidater som kontrollerades. Bredda filtren eller gör ett nytt urval.",
    truncatedDraw: "API:et kortade av den här raden. Välj en annan person.",
    splitsChanged:
      "De tillgängliga dataspråken har ändrats. Välj ett språk och gör ett nytt urval.",
    invalidURL: "Återställningslänken eller frågesträngen är ogiltig.",
    invalidReplayDataset: "Datamängden i återställningslänken är ogiltig.",
    invalidOffset:
      "Värdet offset för återställningen måste vara ett icke-negativt heltal.",
    invalidSplit: "config eller split är ogiltigt.",
    invalidRevision: "Värdet rev i återställningslänken är ogiltigt.",
    invalidUUID: "UUID i återställningslänken är ogiltigt.",
    invalidView: "Utdataformatet i återställningslänken är ogiltigt.",
    replaySplitMissing:
      "Det config / split som anges i länken finns inte längre i den här datamängden.",
    offsetOutOfRange:
      "Värdet offset ligger utanför intervallet. Det aktuella intervallet är 0 till {max}.",
    wrongRow:
      "API:et returnerade en annan radposition. Återställningen avbröts.",
    replayRevisionMismatch:
      "Datamängdens version skiljer sig från versionen i länken. Återställningen avbröts eftersom innehållet kan ha ändrats. Använd en sparad text- eller JSON-fil.",
    replayRevisionMissing:
      "API:et angav ingen version för datamängden. Återställningen avbröts.",
    replayUUIDMismatch:
      "Personens UUID skiljer sig från det i länken. Återställningen avbröts för att undvika att visa en annan person.",
    truncatedReplay:
      "API:et kortade av den här raden. Återställningen avbröts.",
  },
  da: {
    invalidCount: "Antallet af tilgængelige rækker er ugyldigt.",
    invalidDataset: "Vælg et NVIDIA Nemotron Personas-datasæt.",
    rateLimited:
      "Hugging Face har begrænset antallet af forespørgsler. Vent et øjeblik, og prøv igen.",
    httpError:
      "Kunne ikke hente fra Hugging Face (HTTP {status}). Prøv igen, eller vælg et andet land.",
    invalidResponse: "API-svaret kunne ikke læses. Prøv igen.",
    timedOut: "Hugging Face svarede ikke i tide. Prøv igen.",
    connectionFailed:
      "Kunne ikke oprette forbindelse til API'et. Kontrollér din internetforbindelse og browserens netværksbegrænsninger.",
    noData:
      "Ingen data er tilgængelige. Kontrollér, om datasættet er offentligt tilgængeligt.",
    rowMissing:
      "Der er ingen data på den position. Datasættet kan være blevet opdateret.",
    invalidRow: "Rækkens data har et uventet format.",
    invalidAge: "Angiv alderen som et heltal fra 0 til 130.",
    invalidAgeRange: "Den laveste alder må ikke overstige den højeste.",
    invalidSex: "Værdien i kønsfilteret er ugyldig.",
    revisionChangedDuringDraw:
      "Datasættets version ændrede sig under forespørgslen. Foretag en ny udvælgelse.",
    noMatch:
      "Ingen passende person blev fundet blandt de {count} undersøgte kandidater. Gør filtrene mindre restriktive, eller foretag en ny udvælgelse.",
    truncatedDraw: "API'et afkortede denne række. Vælg en anden person.",
    splitsChanged:
      "De tilgængelige datasprog er ændret. Vælg et sprog, og foretag en ny udvælgelse.",
    invalidURL:
      "Linket til genvisning eller forespørgselsstrengen er ugyldigt.",
    invalidReplayDataset: "Datasættet i linket til genvisning er ugyldigt.",
    invalidOffset:
      "Værdien offset til genvisning skal være et ikke-negativt heltal.",
    invalidSplit: "config eller split er ugyldigt.",
    invalidRevision: "Værdien rev i linket til genvisning er ugyldig.",
    invalidUUID: "UUID i linket til genvisning er ugyldigt.",
    invalidView: "Resultatformatet i linket til genvisning er ugyldigt.",
    replaySplitMissing:
      "Det config / split, der er angivet i linket, er ikke længere tilgængeligt i dette datasæt.",
    offsetOutOfRange:
      "Værdien offset ligger uden for intervallet. Det aktuelle interval er fra 0 til {max}.",
    wrongRow:
      "API'et returnerede en anden rækkeposition. Genvisningen blev stoppet.",
    replayRevisionMismatch:
      "Datasættets version er forskellig fra versionen i linket. Genvisningen blev stoppet, fordi indholdet kan være ændret. Brug en gemt tekst- eller JSON-fil.",
    replayRevisionMissing:
      "API'et angav ikke datasættets version. Genvisningen blev stoppet.",
    replayUUIDMismatch:
      "Personens UUID er forskelligt fra det i linket. Genvisningen blev stoppet for at undgå at vise en anden person.",
    truncatedReplay: "API'et afkortede denne række. Genvisningen blev stoppet.",
  },
  no: {
    invalidCount: "Antallet tilgjengelige rader er ugyldig.",
    invalidDataset: "Velg et datasett fra NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face har begrenset antallet forespørsler. Vent litt og prøv igjen.",
    httpError:
      "Kunne ikke hente fra Hugging Face (HTTP {status}). Prøv igjen eller velg et annet land.",
    invalidResponse: "API-svaret kunne ikke leses. Prøv igjen.",
    timedOut: "Hugging Face svarte ikke i tide. Prøv igjen.",
    connectionFailed:
      "Kunne ikke koble til API-et. Kontroller internettforbindelsen og nettleserens nettverksbegrensninger.",
    noData:
      "Ingen data er tilgjengelige. Kontroller om datasettet er offentlig tilgjengelig.",
    rowMissing:
      "Det finnes ingen data på den posisjonen. Datasettet kan ha blitt oppdatert.",
    invalidRow: "Radens data har et uventet format.",
    invalidAge: "Oppgi alderen som et heltall fra 0 til 130.",
    invalidAgeRange: "Laveste alder kan ikke være høyere enn høyeste alder.",
    invalidSex: "Verdien i kjønnsfilteret er ugyldig.",
    revisionChangedDuringDraw:
      "Datasettets versjon ble endret under forespørselen. Gjør et nytt utvalg.",
    noMatch:
      "Ingen passende person ble funnet blant de {count} kandidatene som ble undersøkt. Gjør filtrene mindre strenge eller gjør et nytt utvalg.",
    truncatedDraw: "API-et forkortet denne raden. Velg en annen person.",
    splitsChanged:
      "De tilgjengelige dataspråkene er endret. Velg et språk og gjør et nytt utvalg.",
    invalidURL: "Lenken til personen eller spørringsstrengen er ugyldig.",
    invalidReplayDataset: "Datasettet i personlenken er ugyldig.",
    invalidOffset:
      "Verdien offset for å vise personen på nytt må være et ikke-negativt heltall.",
    invalidSplit: "config eller split er ugyldig.",
    invalidRevision: "Verdien rev i personlenken er ugyldig.",
    invalidUUID: "UUID-en i personlenken er ugyldig.",
    invalidView: "Resultatformatet i personlenken er ugyldig.",
    replaySplitMissing:
      "Det config / split som er angitt i lenken, er ikke lenger tilgjengelig i dette datasettet.",
    offsetOutOfRange:
      "Verdien offset er utenfor området. Det gjeldende området er fra 0 til {max}.",
    wrongRow:
      "API-et returnerte en annen radposisjon. Innlastingen fra lenken ble stoppet.",
    replayRevisionMismatch:
      "Datasettets versjon er forskjellig fra versjonen i lenken. Innlastingen fra lenken ble stoppet fordi innholdet kan være endret. Bruk en lagret tekst- eller JSON-fil.",
    replayRevisionMissing:
      "API-et oppga ikke datasettets versjon. Innlastingen fra lenken ble stoppet.",
    replayUUIDMismatch:
      "Personens UUID er forskjellig fra den i lenken. Innlastingen fra lenken ble stoppet for å unngå å vise en annen person.",
    truncatedReplay:
      "API-et forkortet denne raden. Innlastingen fra lenken ble stoppet.",
  },
  fi: {
    invalidCount: "Saatavilla olevien rivien määrä on virheellinen.",
    invalidDataset: "Valitse NVIDIA Nemotron Personas -aineisto.",
    rateLimited:
      "Hugging Face rajoitti pyyntöjen määrää. Odota hetki ja yritä uudelleen.",
    httpError:
      "Haku Hugging Facesta epäonnistui (HTTP {status}). Yritä uudelleen tai valitse toinen maa.",
    invalidResponse: "Rajapinnan vastausta ei voitu lukea. Yritä uudelleen.",
    timedOut: "Hugging Face ei vastannut ajoissa. Yritä uudelleen.",
    connectionFailed:
      "Rajapintaan ei saatu yhteyttä. Tarkista internetyhteys ja selaimen verkkorajoitukset.",
    noData:
      "Tietoja ei ole saatavilla. Tarkista, onko aineisto julkisesti käytettävissä.",
    rowMissing:
      "Tässä sijainnissa ei ole tietoja. Aineisto on ehkä päivitetty.",
    invalidRow: "Rivin tiedot ovat odottamattomassa muodossa.",
    invalidAge: "Anna ikä kokonaislukuna väliltä 0–130.",
    invalidAgeRange: "Vähimmäisikä ei saa ylittää enimmäisikää.",
    invalidSex: "Sukupuolisuodattimen arvo on virheellinen.",
    revisionChangedDuringDraw:
      "Aineiston versio muuttui pyynnön aikana. Tee uusi valinta.",
    noMatch:
      "Tarkistettujen {count} ehdokkaan joukosta ei löytynyt sopivaa henkilöä. Väljennä suodattimia tai tee uusi valinta.",
    truncatedDraw:
      "Rajapinta lyhensi tämän rivin sisältöä. Valitse toinen henkilö.",
    splitsChanged:
      "Aineiston saatavilla olevat kielet ovat muuttuneet. Valitse kieli ja tee uusi henkilövalinta.",
    invalidURL: "Henkilön URL-osoite tai kyselymerkkijono on virheellinen.",
    invalidReplayDataset: "Henkilön URL-osoitteen aineisto on virheellinen.",
    invalidOffset:
      "Uudelleen näyttämisen offset-arvon on oltava ei-negatiivinen kokonaisluku.",
    invalidSplit: "config tai split on virheellinen.",
    invalidRevision: "Henkilön URL-osoitteen rev-arvo on virheellinen.",
    invalidUUID: "Henkilön URL-osoitteen UUID on virheellinen.",
    invalidView: "Henkilön URL-osoitteen tulostusmuoto on virheellinen.",
    replaySplitMissing:
      "URL-osoitteen config / split ei ole enää saatavilla tässä aineistossa.",
    offsetOutOfRange:
      "offset-arvo on alueen ulkopuolella. Nykyinen alue on 0–{max}.",
    wrongRow:
      "Rajapinta palautti eri rivin sijainnin. Uudelleen näyttäminen keskeytettiin.",
    replayRevisionMismatch:
      "Aineiston versio eroaa URL-osoitteen versiosta. Uudelleen näyttäminen keskeytettiin, koska sisältö on voinut muuttua. Käytä tallennettua teksti- tai JSON-tiedostoa.",
    replayRevisionMissing:
      "Rajapinta ei ilmoittanut aineiston versiota. Uudelleen näyttäminen keskeytettiin.",
    replayUUIDMismatch:
      "Henkilön UUID eroaa URL-osoitteessa olevasta. Uudelleen näyttäminen keskeytettiin, jotta eri henkilöä ei näytettäisi.",
    truncatedReplay:
      "Rajapinta lyhensi tämän rivin sisältöä. Uudelleen näyttäminen keskeytettiin.",
  },
  ar: {
    invalidCount: "عدد الصفوف المتاحة غير صالح.",
    invalidDataset: "اختر مجموعة بيانات من NVIDIA Nemotron Personas.",
    rateLimited:
      "بلغت الطلبات الحد المسموح به لدى Hugging Face. انتظر قليلًا ثم أعد المحاولة.",
    httpError:
      "تعذّر جلب البيانات من Hugging Face ‏(HTTP {status}). أعد المحاولة أو اختر بلدًا آخر.",
    invalidResponse: "تعذّرت قراءة استجابة واجهة API. أعد المحاولة.",
    timedOut: "لم يستجب Hugging Face في الوقت المحدد. أعد المحاولة.",
    connectionFailed:
      "تعذّر الاتصال بواجهة API. تحقق من اتصال الإنترنت وقيود الشبكة في المتصفح.",
    noData: "لا توجد بيانات متاحة. تحقق من إتاحة مجموعة البيانات للجمهور.",
    rowMissing: "لا توجد بيانات في هذا الموضع. ربما تم تحديث مجموعة البيانات.",
    invalidRow: "صيغة بيانات الصف غير متوقعة.",
    invalidAge: "أدخل العمر كعدد صحيح من 0 إلى 130.",
    invalidAgeRange: "يجب ألا يتجاوز الحد الأدنى للعمر الحد الأقصى.",
    invalidSex: "قيمة تصفية الجنس غير صالحة.",
    revisionChangedDuringDraw:
      "تغيّر إصدار مجموعة البيانات أثناء الطلب. أعد الاختيار.",
    noMatch:
      "لم توجد شخصية مطابقة بين الشخصيات الـ{count} التي فُحصت. خفف عوامل التصفية أو أعد الاختيار.",
    truncatedDraw: "اختصرت واجهة API محتوى هذا الصف. اختر شخصية أخرى.",
    splitsChanged: "تغيّرت لغات البيانات المتاحة. اختر لغة وأعد الاختيار.",
    invalidURL: "رابط استعادة الشخصية أو سلسلة الاستعلام غير صالح.",
    invalidReplayDataset: "مجموعة البيانات في رابط استعادة الشخصية غير صالحة.",
    invalidOffset: "يجب أن تكون قيمة offset للاستعادة عددًا صحيحًا غير سالب.",
    invalidSplit: "قيمة config أو split غير صالحة.",
    invalidRevision: "قيمة rev في رابط استعادة الشخصية غير صالحة.",
    invalidUUID: "معرّف UUID في رابط استعادة الشخصية غير صالح.",
    invalidView: "صيغة الناتج في رابط استعادة الشخصية غير صالحة.",
    replaySplitMissing:
      "لم تعد قيمة config / split المسجلة في الرابط متاحة في مجموعة البيانات هذه.",
    offsetOutOfRange: "قيمة offset خارج النطاق. النطاق الحالي من 0 إلى {max}.",
    wrongRow: "أعادت واجهة API موضع صف مختلفًا. تم إيقاف الاستعادة.",
    replayRevisionMismatch:
      "يختلف إصدار مجموعة البيانات عن الإصدار المسجل في الرابط. تم إيقاف الاستعادة لأن المحتوى ربما تغيّر. استخدم ملفًا نصيًا أو ملف JSON محفوظًا.",
    replayRevisionMissing:
      "لم توفر واجهة API إصدار مجموعة البيانات. تم إيقاف الاستعادة.",
    replayUUIDMismatch:
      "يختلف معرّف UUID للشخصية عن المسجل في الرابط. تم إيقاف الاستعادة لتجنب عرض شخصية أخرى.",
    truncatedReplay: "اختصرت واجهة API محتوى هذا الصف. تم إيقاف الاستعادة.",
  },
  he: {
    invalidCount: "מספר השורות הזמינות אינו תקין.",
    invalidDataset: "בחרו מערך נתונים של NVIDIA Nemotron Personas.",
    rateLimited: "Hugging Face הגביל את קצב הבקשות. המתינו רגע ונסו שוב.",
    httpError:
      "לא ניתן לקבל נתונים מ־Hugging Face ‏(HTTP {status}). נסו שוב או בחרו מדינה אחרת.",
    invalidResponse: "לא ניתן לקרוא את תשובת ה־API. נסו שוב.",
    timedOut: "Hugging Face לא הגיב בזמן. נסו שוב.",
    connectionFailed:
      "לא ניתן להתחבר ל־API. בדקו את החיבור לאינטרנט ואת מגבלות הרשת בדפדפן.",
    noData: "אין נתונים זמינים. בדקו אם מערך הנתונים נגיש לציבור.",
    rowMissing: "אין נתונים במיקום הזה. ייתכן שמערך הנתונים עודכן.",
    invalidRow: "נתוני השורה הם בפורמט בלתי צפוי.",
    invalidAge: "הזינו גיל כמספר שלם בין 0 ל־130.",
    invalidAgeRange: "הגיל המינימלי לא יכול להיות גבוה מהגיל המקסימלי.",
    invalidSex: "הערך במסנן המין אינו תקין.",
    revisionChangedDuringDraw:
      "גרסת מערך הנתונים השתנתה במהלך הבקשה. בצעו בחירה חדשה.",
    noMatch:
      "לא נמצאה דמות מתאימה בין {count} הדמויות שנבדקו. הרחיבו את המסננים או בצעו בחירה חדשה.",
    truncatedDraw: "ה־API קיצר את השורה הזו. בחרו דמות אחרת.",
    splitsChanged: "שפות הנתונים הזמינות השתנו. בחרו שפה ובצעו בחירה חדשה.",
    invalidURL: "קישור השחזור או מחרוזת השאילתה אינם תקינים.",
    invalidReplayDataset: "מערך הנתונים בקישור השחזור אינו תקין.",
    invalidOffset: "הערך offset לשחזור חייב להיות מספר שלם שאינו שלילי.",
    invalidSplit: "הערך config או split אינו תקין.",
    invalidRevision: "הערך rev בקישור השחזור אינו תקין.",
    invalidUUID: "ה־UUID בקישור השחזור אינו תקין.",
    invalidView: "פורמט הפלט בקישור השחזור אינו תקין.",
    replaySplitMissing:
      "ה־config / split הרשומים בקישור אינם זמינים עוד במערך הנתונים הזה.",
    offsetOutOfRange: "הערך offset מחוץ לטווח. הטווח הנוכחי הוא מ־0 עד {max}.",
    wrongRow: "ה־API החזיר מיקום שורה שונה. השחזור הופסק.",
    replayRevisionMismatch:
      "גרסת מערך הנתונים שונה מהגרסה שבקישור. השחזור הופסק משום שייתכן שהתוכן השתנה. השתמשו בקובץ טקסט או JSON שנשמר.",
    replayRevisionMissing: "ה־API לא סיפק גרסה של מערך הנתונים. השחזור הופסק.",
    replayUUIDMismatch:
      "ה־UUID של הדמות שונה מזה שבקישור. השחזור הופסק כדי להימנע מהצגת דמות אחרת.",
    truncatedReplay: "ה־API קיצר את השורה הזו. השחזור הופסק.",
  },
  fa: {
    invalidCount: "تعداد ردیف‌های در دسترس نامعتبر است.",
    invalidDataset: "یک مجموعه‌داده از NVIDIA Nemotron Personas انتخاب کنید.",
    rateLimited:
      "محدودیت تعداد درخواست‌های Hugging Face اعمال شده است. کمی صبر کنید و دوباره امتحان کنید.",
    httpError:
      "دریافت از Hugging Face ممکن نشد (HTTP {status}). دوباره امتحان کنید یا کشور دیگری انتخاب کنید.",
    invalidResponse: "پاسخ API خوانده نشد. دوباره امتحان کنید.",
    timedOut: "Hugging Face به‌موقع پاسخ نداد. دوباره امتحان کنید.",
    connectionFailed:
      "اتصال به API ممکن نشد. اتصال اینترنت و محدودیت‌های شبکهٔ مرورگر را بررسی کنید.",
    noData:
      "داده‌ای در دسترس نیست. عمومی بودن دسترسی به مجموعه‌داده را بررسی کنید.",
    rowMissing:
      "در این موقعیت داده‌ای وجود ندارد. شاید مجموعه‌داده به‌روزرسانی شده باشد.",
    invalidRow: "قالب داده‌های ردیف با قالب مورد انتظار متفاوت است.",
    invalidAge: "سن را به‌صورت عدد صحیح از 0 تا 130 وارد کنید.",
    invalidAgeRange: "حداقل سن نباید از حداکثر سن بیشتر باشد.",
    invalidSex: "مقدار فیلتر جنسیت نامعتبر است.",
    revisionChangedDuringDraw:
      "نسخهٔ مجموعه‌داده هنگام درخواست تغییر کرد. دوباره انتخاب کنید.",
    noMatch:
      "در میان {count} شخصیت بررسی‌شده، مورد مطابقی پیدا نشد. محدودیت فیلترها را کمتر کنید یا دوباره انتخاب کنید.",
    truncatedDraw:
      "API بخشی از این ردیف را حذف کرده است. شخصیت دیگری انتخاب کنید.",
    splitsChanged:
      "زبان‌های دادهٔ در دسترس تغییر کرده‌اند. زبانی انتخاب کنید و دوباره انتخاب شخصیت را انجام دهید.",
    invalidURL: "نشانی بازیابی یا رشتهٔ پرس‌وجو نامعتبر است.",
    invalidReplayDataset: "مجموعه‌داده در نشانی بازیابی نامعتبر است.",
    invalidOffset: "مقدار offset برای بازیابی باید عدد صحیح نامنفی باشد.",
    invalidSplit: "مقدار config یا split نامعتبر است.",
    invalidRevision: "مقدار rev در نشانی بازیابی نامعتبر است.",
    invalidUUID: "شناسهٔ UUID در نشانی بازیابی نامعتبر است.",
    invalidView: "قالب خروجی در نشانی بازیابی نامعتبر است.",
    replaySplitMissing:
      "مقدار config / split ثبت‌شده در نشانی دیگر در این مجموعه‌داده موجود نیست.",
    offsetOutOfRange:
      "مقدار offset خارج از محدوده است. محدودهٔ فعلی از 0 تا {max} است.",
    wrongRow: "API موقعیت ردیف متفاوتی برگرداند. بازیابی متوقف شد.",
    replayRevisionMismatch:
      "نسخهٔ مجموعه‌داده با نسخهٔ ثبت‌شده در نشانی تفاوت دارد. چون ممکن است محتوا تغییر کرده باشد، بازیابی متوقف شد. از فایل متنی یا JSON ذخیره‌شده استفاده کنید.",
    replayRevisionMissing:
      "API نسخهٔ مجموعه‌داده را ارائه نکرد. بازیابی متوقف شد.",
    replayUUIDMismatch:
      "شناسهٔ UUID شخصیت با شناسهٔ ثبت‌شده در نشانی تفاوت دارد. برای جلوگیری از نمایش شخصیت دیگری، بازیابی متوقف شد.",
    truncatedReplay: "API بخشی از این ردیف را حذف کرده است. بازیابی متوقف شد.",
  },
  ur: {
    invalidCount: "دستیاب قطاروں کی تعداد درست نہیں ہے۔",
    invalidDataset: "NVIDIA Nemotron Personas کا ڈیٹا سیٹ منتخب کریں۔",
    rateLimited:
      "Hugging Face نے درخواستوں کی رفتار محدود کر دی ہے۔ کچھ دیر انتظار کریں اور دوبارہ کوشش کریں۔",
    httpError:
      "Hugging Face سے ڈیٹا حاصل نہیں ہو سکا (HTTP {status})۔ دوبارہ کوشش کریں یا کوئی اور ملک منتخب کریں۔",
    invalidResponse: "API کا جواب پڑھا نہیں جا سکا۔ دوبارہ کوشش کریں۔",
    timedOut: "Hugging Face نے وقت پر جواب نہیں دیا۔ دوبارہ کوشش کریں۔",
    connectionFailed:
      "API سے رابطہ نہیں ہو سکا۔ انٹرنیٹ کنکشن اور براؤزر کی نیٹ ورک پابندیاں دیکھیں۔",
    noData:
      "کوئی ڈیٹا دستیاب نہیں ہے۔ دیکھیں کہ آیا ڈیٹا سیٹ عوامی طور پر قابل رسائی ہے۔",
    rowMissing: "اس جگہ کوئی ڈیٹا نہیں ہے۔ ممکن ہے ڈیٹا سیٹ اپ ڈیٹ ہو گیا ہو۔",
    invalidRow: "قطار کے ڈیٹا کی شکل متوقع شکل سے مختلف ہے۔",
    invalidAge: "عمر 0 سے 130 تک ایک صحیح عدد میں درج کریں۔",
    invalidAgeRange:
      "کم از کم عمر، زیادہ سے زیادہ عمر سے زیادہ نہیں ہونی چاہیے۔",
    invalidSex: "جنس کے فلٹر کی قدر درست نہیں ہے۔",
    revisionChangedDuringDraw:
      "درخواست کے دوران ڈیٹا سیٹ کا نسخہ بدل گیا۔ دوبارہ انتخاب کریں۔",
    noMatch:
      "جانچی گئی {count} شخصیات میں کوئی موزوں شخصیت نہیں ملی۔ فلٹرز کی پابندیاں کم کریں یا دوبارہ انتخاب کریں۔",
    truncatedDraw:
      "API نے اس قطار کا کچھ حصہ حذف کر دیا ہے۔ کوئی اور شخصیت منتخب کریں۔",
    splitsChanged:
      "ڈیٹا کی دستیاب زبانیں بدل گئی ہیں۔ زبان منتخب کریں اور دوبارہ شخصیت منتخب کریں۔",
    invalidURL: "دوبارہ دکھانے کا URL یا استفسار کی عبارت درست نہیں ہے۔",
    invalidReplayDataset: "دوبارہ دکھانے کے URL میں ڈیٹا سیٹ درست نہیں ہے۔",
    invalidOffset:
      "دوبارہ دکھانے کے لیے offset صفر یا اس سے بڑا صحیح عدد ہونا چاہیے۔",
    invalidSplit: "config یا split درست نہیں ہے۔",
    invalidRevision: "دوبارہ دکھانے کے URL میں rev کی قدر درست نہیں ہے۔",
    invalidUUID: "دوبارہ دکھانے کے URL میں UUID درست نہیں ہے۔",
    invalidView: "دوبارہ دکھانے کے URL میں آؤٹ پٹ کی شکل درست نہیں ہے۔",
    replaySplitMissing:
      "URL میں درج config / split اب اس ڈیٹا سیٹ میں دستیاب نہیں ہے۔",
    offsetOutOfRange: "offset حد سے باہر ہے۔ موجودہ حد 0 سے {max} تک ہے۔",
    wrongRow: "API نے قطار کی مختلف جگہ واپس کی۔ دوبارہ دکھانا روک دیا گیا۔",
    replayRevisionMismatch:
      "ڈیٹا سیٹ کا نسخہ URL میں درج نسخے سے مختلف ہے۔ مواد بدل جانے کے امکان کے باعث دوبارہ دکھانا روک دیا گیا۔ محفوظ شدہ متنی یا JSON فائل استعمال کریں۔",
    replayRevisionMissing:
      "API نے ڈیٹا سیٹ کا نسخہ فراہم نہیں کیا۔ دوبارہ دکھانا روک دیا گیا۔",
    replayUUIDMismatch:
      "شخصیت کا UUID، URL میں درج UUID سے مختلف ہے۔ کسی اور شخصیت کو دکھانے سے بچنے کے لیے دوبارہ دکھانا روک دیا گیا۔",
    truncatedReplay:
      "API نے اس قطار کا کچھ حصہ حذف کر دیا ہے۔ دوبارہ دکھانا روک دیا گیا۔",
  },
  sw: {
    invalidCount: "Idadi ya safu mlalo zinazopatikana si halali.",
    invalidDataset: "Chagua seti ya data ya NVIDIA Nemotron Personas.",
    rateLimited:
      "Hugging Face imeweka kikomo cha kasi ya maombi. Subiri kidogo kisha ujaribu tena.",
    httpError:
      "Haikuweza kupata data kutoka Hugging Face (HTTP {status}). Jaribu tena au uchague nchi nyingine.",
    invalidResponse: "Jibu la API halikuweza kusomwa. Jaribu tena.",
    timedOut: "Hugging Face haikujibu kwa wakati. Jaribu tena.",
    connectionFailed:
      "Haikuweza kuunganisha kwenye API. Angalia muunganisho wa intaneti na vizuizi vya mtandao vya kivinjari.",
    noData:
      "Hakuna data inayopatikana. Angalia ikiwa seti ya data inapatikana kwa umma.",
    rowMissing:
      "Hakuna data katika nafasi hiyo. Huenda seti ya data imesasishwa.",
    invalidRow: "Data ya safu mlalo ina muundo usiotarajiwa.",
    invalidAge: "Weka umri kama namba kamili kuanzia 0 hadi 130.",
    invalidAgeRange: "Umri wa chini haupaswi kuzidi umri wa juu.",
    invalidSex: "Thamani ya kichujio cha jinsia si halali.",
    revisionChangedDuringDraw:
      "Toleo la seti ya data limebadilika wakati wa ombi. Chagua tena.",
    noMatch:
      "Hakuna mhusika anayefaa aliyepatikana kati ya wahusika {count} waliokaguliwa. Punguza masharti ya vichujio au uchague tena.",
    truncatedDraw: "API imefupisha safu mlalo hii. Chagua mhusika mwingine.",
    splitsChanged:
      "Lugha za data zinazopatikana zimebadilika. Chagua lugha kisha uchague mhusika tena.",
    invalidURL: "URL ya kuonyesha mhusika tena au mfuatano wa hoja si halali.",
    invalidReplayDataset:
      "Seti ya data katika URL ya kuonyesha mhusika tena si halali.",
    invalidOffset:
      "Thamani ya offset ya kuonyesha tena lazima iwe namba kamili isiyo hasi.",
    invalidSplit: "config au split si halali.",
    invalidRevision:
      "Thamani ya rev katika URL ya kuonyesha mhusika tena si halali.",
    invalidUUID: "UUID katika URL ya kuonyesha mhusika tena si halali.",
    invalidView:
      "Muundo wa matokeo katika URL ya kuonyesha mhusika tena si halali.",
    replaySplitMissing:
      "config / split iliyo kwenye URL haipatikani tena katika seti hii ya data.",
    offsetOutOfRange:
      "Thamani ya offset iko nje ya kiwango kinachoruhusiwa. Kiwango cha sasa ni 0 hadi {max}.",
    wrongRow:
      "API imerudisha nafasi tofauti ya safu mlalo. Kuonyesha mhusika tena kumesimamishwa.",
    replayRevisionMismatch:
      "Toleo la seti ya data ni tofauti na lililo kwenye URL. Kuonyesha mhusika tena kumesimamishwa kwa sababu huenda maudhui yamebadilika. Tumia faili ya maandishi au JSON iliyohifadhiwa.",
    replayRevisionMissing:
      "API haikutoa toleo la seti ya data. Kuonyesha mhusika tena kumesimamishwa.",
    replayUUIDMismatch:
      "UUID ya mhusika ni tofauti na iliyo kwenye URL. Kuonyesha tena kumesimamishwa ili kuepuka kuonyesha mhusika mwingine.",
    truncatedReplay:
      "API imefupisha safu mlalo hii. Kuonyesha mhusika tena kumesimamishwa.",
  },
};
const REGIONS = {
  Japan: "JP",
  USA: "US",
  India: "IN",
  Singapore: "SG",
  Korea: "KR",
  Vietnam: "VN",
  Brazil: "BR",
  France: "FR",
  "El-Salvador": "SV",
  Belgium: "BE",
};
const DATA_LANGUAGES = {
  Japan: "ja",
  USA: "en",
  India: "en",
  Singapore: "en",
  Korea: "ko",
  Vietnam: "vi",
  Brazil: "pt",
  France: "fr",
  "El-Salvador": "es",
  Belgium: "en",
};
const SPLIT_LANGUAGES = {
  en_IN: "en",
  hi_Deva_IN: "hi",
  hi_Latn_IN: "hi-Latn",
  en_BE: "en",
  nl_BE: "nl",
  fr_BE: "fr",
  de_BE: "de",
};
const LANGUAGE_NAMES = {
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  gu: "Gujarati",
  ko: "Korean",
  vi: "Vietnamese",
  pt: "Portuguese",
  nl: "Dutch",
  de: "German",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  bn: "Bengali",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
  as: "Assamese",
  ne: "Nepali",
  ms: "Malay",
  "hi-Latn": "Hindi (Latin script)",
};
const displayNamesCache = new Map();
const languageAliases = new Map([
  ["gujarati", "gu"],
  ["गुजराती", "gu"],
  ["español", "es"],
]);
for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
  languageAliases.set(code.toLowerCase(), code);
  languageAliases.set(name.toLowerCase(), code);
  for (const locale of ["en", "ja", "zh", "es", "fr", "hi", code]) {
    try {
      languageAliases.set(
        new Intl.DisplayNames([locale], { type: "language" })
          .of(code)
          .normalize("NFKC")
          .toLowerCase(),
        code,
      );
    } catch {
      /* English aliases remain available. */
    }
  }
}
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);
const UI_LANGUAGE_ALIASES = {
  nb: "no",
  nn: "no",
  tl: "fil",
  iw: "he",
  in: "id",
};
function resolveUILanguage(value) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")[0];
  const code = Object.hasOwn(UI_LANGUAGE_ALIASES, base)
    ? UI_LANGUAGE_ALIASES[base]
    : base;
  return Object.hasOwn(I18N, code) ? code : "";
}
function initialLanguage() {
  const requested = resolveUILanguage(
    new URL(location.href).searchParams.get("ui"),
  );
  if (requested) return requested;
  for (const language of [...(navigator.languages || []), navigator.language]) {
    const code = resolveUILanguage(language);
    if (code) return code;
  }
  return "en";
}
function t(key, values = {}) {
  const message =
    I18N[state.ui]?.[key] ??
    I18N.en[key] ??
    ERRORS[state.ui]?.[key] ??
    ERRORS.en[key] ??
    key;
  return String(message).replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
function formatNumber(number) {
  return Number(number).toLocaleString(state.ui === "zh" ? "zh-CN" : state.ui);
}
function displayName(code, type, fallback = code) {
  try {
    const cacheKey = state.ui + "/" + type;
    if (!displayNamesCache.has(cacheKey))
      displayNamesCache.set(
        cacheKey,
        new Intl.DisplayNames([state.ui], { type }),
      );
    return displayNamesCache.get(cacheKey).of(code) || fallback;
  } catch {
    return fallback;
  }
}
function languageName(code) {
  return displayName(code, "language", LANGUAGE_NAMES[code] || code);
}
function countryName(dataset) {
  const suffix = dataset.slice(PREFIX.length),
    region = REGIONS[suffix],
    entry = state.catalog.get(dataset);
  return region
    ? displayName(
        region,
        "region",
        state.ui === "ja"
          ? entry?.label || suffix
          : suffix.replaceAll("-", " "),
      )
    : entry?.label || suffix;
}
function dataLanguageCode(dataset, split) {
  return (
    SPLIT_LANGUAGES[split] ||
    (split === "train" ? DATA_LANGUAGES[dataset.slice(PREFIX.length)] : "")
  );
}
function dataLanguageName(dataset, split) {
  const code = dataLanguageCode(dataset, split);
  return code ? languageName(code) : split === "train" ? t("original") : split;
}
function practiceLanguage(current) {
  const first =
    typeof current.row.first_language === "string"
      ? current.row.first_language.trim()
      : "";
  if (
    first &&
    first.length <= 100 &&
    !/^(?:unknown|unspecified|none|n\/a|null|-|不明|未記載)$/i.test(first)
  ) {
    const code = languageAliases.get(first.normalize("NFKC").toLowerCase());
    return {
      code: code?.split("-")[0] || "",
      name: code ? languageName(code.split("-")[0]) : first,
    };
  }
  const code =
    dataLanguageCode(current.dataset, current.split)?.split("-")[0] || "";
  return { code, name: code ? languageName(code) : t("personaLanguage") };
}
function renderPrompts() {
  const current = state.current;
  el.copyEnglishPrompt.disabled = state.busy || !current;
  el.copyLocalPrompt.disabled = state.busy || !current;
  if (!current) {
    el.englishPrompt.value = "";
    el.localPrompt.value = "";
    el.localPromptDetails.hidden = true;
    return;
  }
  const background = outputText(current, "background"),
    local = practiceLanguage(current);
  el.englishPrompt.value = t("promptTemplate", {
    language: languageName("en"),
    background,
  });
  el.localPromptDetails.hidden = local.code === "en";
  el.localPromptTitle.textContent = t("localExample", { language: local.name });
  el.localPrompt.value =
    local.code === "en"
      ? ""
      : t("promptTemplate", { language: local.name, background });
  el.copyLocalPrompt.disabled = state.busy || local.code === "en";
}
function showStatus(parts, kind = "info") {
  state.notice = { parts, kind };
  el.status.hidden = false;
  el.status.textContent = parts
    .map((part) =>
      typeof part === "string"
        ? t(part)
        : Object.hasOwn(part, "literal")
          ? part.literal
          : t(part.key, part.values),
    )
    .join(" ");
  el.status.dataset.kind = kind;
}
function clearStatus() {
  state.notice = null;
  el.status.textContent = "";
  el.status.hidden = true;
  el.status.dataset.kind = "info";
}
function problem(key, values = {}) {
  const error = new Error(t(key, values));
  error.i18nKey = key;
  error.i18nValues = values;
  return error;
}
function sayError(error) {
  const parts = [
    error.i18nKey
      ? { key: error.i18nKey, values: error.i18nValues }
      : { literal: error.message || t("fetchFailed") },
  ];
  showStatus(parts, "error");
}
function applyLanguage(language, { syncURL = true } = {}) {
  const selected = el.country.value || DEFAULT_SCOPE,
    split = el.split.value;
  state.ui = resolveUILanguage(language) || "en";
  document.documentElement.lang =
    state.ui === "zh" ? "zh-Hans" : state.ui === "no" ? "nb" : state.ui;
  document.documentElement.dir = RTL_LANGUAGES.has(state.ui) ? "rtl" : "ltr";
  el.uiLanguage.value = state.ui;
  for (const node of document.querySelectorAll("[data-i18n]"))
    node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll("[data-i18n-placeholder]"))
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  for (const node of document.querySelectorAll("[data-i18n-aria]"))
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  renderCountries(selected);
  renderSplits(split);
  renderOutput();
  setBusy(state.busy);
  if (state.notice) showStatus(state.notice.parts, state.notice.kind);
  else clearStatus();
  if (syncURL) {
    if (state.current) writeURL();
    else {
      const url = new URL(location.href);
      url.searchParams.set("ui", state.ui);
      try {
        history.replaceState(null, "", url.href);
      } catch {
        /* The selected UI remains usable. */
      }
    }
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}
function valueText(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function folded(value) {
  return String(value).normalize("NFKC").toLowerCase();
}
function safeDataset(value) {
  return (
    typeof value === "string" &&
    /^nvidia\/Nemotron-Personas-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  );
}
function cancelled(signal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
function randomInt(size) {
  if (!Number.isSafeInteger(size) || size <= 0) throw problem("invalidCount");
  if (globalThis.crypto?.getRandomValues && size <= 4294967296) {
    const limit = 4294967296 - (4294967296 % size),
      data = new Uint32Array(1);
    do {
      crypto.getRandomValues(data);
    } while (data[0] >= limit);
    return data[0] % size;
  }
  return Math.floor(Math.random() * size);
}
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function makeOption(label, value) {
  const option = document.createElement("option");
  option.textContent = label;
  option.value = value;
  return option;
}
function splitKey(item) {
  return JSON.stringify([item.config, item.split]);
}
function renderCountries(selected = el.country.value || DEFAULT_SCOPE) {
  el.country.replaceChildren(makeOption(t("allCountries"), "all"));
  for (const item of state.catalog.values())
    el.country.append(makeOption(countryName(item.id), item.id));
  el.country.value = selected;
}
function ensureDataset(dataset) {
  if (!safeDataset(dataset)) throw problem("invalidDataset");
  if (!state.catalog.has(dataset))
    state.catalog.set(dataset, {
      id: dataset,
      label: dataset.slice(PREFIX.length).replaceAll("-", " "),
      language: "原文",
      splits: [{ config: "default", split: "train" }],
    });
}
function renderSplits(preferred) {
  const all = el.country.value === "all";
  if (all) {
    el.split.replaceChildren(makeOption(t("defaultLanguages"), ""));
    el.split.disabled = true;
    el.languageField.hidden = true;
    el.selectors.classList.add("single-language");
    return;
  }
  const entry = state.catalog.get(el.country.value);
  if (!entry) return;
  el.split.disabled = false;
  const pairs = state.metadata.get(entry.id)?.splits || entry.splits;
  el.languageField.hidden = pairs.length < 2;
  el.selectors.classList.toggle("single-language", pairs.length < 2);
  el.split.replaceChildren(
    ...pairs.map((item) =>
      makeOption(
        dataLanguageName(entry.id, item.split) +
          (item.config === "default" ? "" : ` / ${item.config}`),
        splitKey(item),
      ),
    ),
  );
  const choice = preferred || splitKey(preferredSplit(entry.id, pairs));
  if (pairs.some((p) => splitKey(p) === choice)) el.split.value = choice;
}
function setBusy(busy) {
  state.busy = busy;
  el.controlsFieldset.disabled = busy;
  el.cancelButton.hidden = !busy;
  el.drawLabel.textContent = busy ? t("loading") : t("draw");
  el.resultPanel.setAttribute("aria-busy", String(busy));
  for (const control of [el.copyButton, el.downloadButton, el.copyUrlButton])
    control.disabled = busy || !state.current;
  for (const button of formatButtons) button.disabled = busy;
  el.copyEnglishPrompt.disabled = busy || !state.current;
  el.copyLocalPrompt.disabled =
    busy || !state.current || el.localPromptDetails.hidden;
}
async function runJob(callback) {
  state.abort?.abort();
  const controller = new AbortController(),
    job = ++state.job;
  state.abort = controller;
  clearStatus();
  setBusy(true);
  try {
    await callback(controller.signal);
  } catch (error) {
    if (job !== state.job) return;
    if (controller.signal.aborted) clearStatus();
    else sayError(error);
  } finally {
    if (job === state.job) {
      setBusy(false);
      state.abort = null;
    }
  }
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    cancelled(signal);
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}
async function getJSON(url, signal, { timeout = 20000, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    cancelled(signal);
    const request = new AbortController();
    let timedOut = false;
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, timeout);
    let retryDelay = 1000;
    try {
      const response = await fetch(url, {
        signal: request.signal,
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
      });
      let body;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const error = problem(
          response.status === 429 ? "rateLimited" : "httpError",
          { status: response.status },
        );
        error.retryable = response.status === 429 || response.status >= 500;
        const after = response.headers.get("Retry-After");
        if (after) {
          const seconds = Number(after);
          const delay = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(after) - Date.now();
          if (delay > 10000) error.retryable = false;
          else if (delay > 0) retryDelay = delay;
        }
        throw error;
      }
      if (!body || typeof body !== "object") {
        const error = problem("invalidResponse");
        error.retryable = false;
        throw error;
      }
      return { data: body, revision: response.headers.get("X-Revision") || "" };
    } catch (error) {
      cancelled(signal);
      const canRetry = error.retryable !== false;
      if (attempt === retries || !canRetry) {
        if (timedOut) throw problem("timedOut");
        if (error instanceof TypeError) throw problem("connectionFailed");
        throw error;
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    await pause(retryDelay, signal);
  }
}
function apiURL(endpoint, params) {
  const url = new URL(API + "/" + endpoint);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  return url.href;
}
async function getMetadata(dataset, signal) {
  const cached = state.metadata.get(dataset);
  if (cached && Date.now() - cached.fetchedAt < 120000) return cached;
  const response = await getJSON(apiURL("size", { dataset }), signal);
  const splits = response.data.size?.splits?.filter(
    (item) =>
      typeof item.config === "string" &&
      typeof item.split === "string" &&
      Number.isSafeInteger(item.num_rows) &&
      item.num_rows > 0,
  );
  if (!splits?.length) throw problem("noData");
  const metadata = {
    splits,
    revision: response.revision,
    partial: response.data.partial === true,
    fetchedAt: Date.now(),
  };
  state.metadata.set(dataset, metadata);
  return metadata;
}
async function getRows(descriptor, offset, length, signal) {
  const response = await getJSON(
    apiURL("rows", {
      dataset: descriptor.dataset,
      config: descriptor.config,
      split: descriptor.split,
      offset,
      length,
    }),
    signal,
  );
  if (!Array.isArray(response.data.rows) || !response.data.rows.length)
    throw problem("rowMissing");
  for (const item of response.data.rows)
    if (
      !Number.isSafeInteger(item.row_idx) ||
      item.row_idx < 0 ||
      !item.row ||
      typeof item.row !== "object"
    )
      throw problem("invalidRow");
  return response;
}
function ageValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{1,3}$/.test(text) || Number(text) > 130)
    throw problem("invalidAge");
  return Number(text);
}
function makeFilters(min, max, sex = "") {
  const filters = {
    min: ageValue(min),
    max: ageValue(max),
    sex: String(sex ?? ""),
  };
  if (filters.min !== null && filters.max !== null && filters.min > filters.max)
    throw problem("invalidAgeRange");
  if (!["", "female", "male"].includes(filters.sex))
    throw problem("invalidSex");
  return filters;
}
const SEX_VALUES = {
  female: new Set([
    "female",
    "woman",
    "femme",
    "feminino",
    "femenino",
    "vrouw",
    "frau",
    "nữ",
    "女",
    "女性",
    "여자",
    "여성",
    "महिला",
    "स्त्री",
    "mahila",
  ]),
  male: new Set([
    "male",
    "man",
    "mann",
    "homme",
    "masculino",
    "nam",
    "男",
    "男性",
    "남자",
    "남성",
    "पुरुष",
    "purush",
  ]),
};
function normalizedSex(value) {
  const text = folded(value ?? "").trim();
  for (const [sex, values] of Object.entries(SEX_VALUES))
    if (values.has(text)) return sex;
  return "";
}
function matches(row, filters) {
  if (filters.min !== null || filters.max !== null) {
    if (!hasValue(row.age) || !Number.isFinite(Number(row.age))) return false;
    if (filters.min !== null && Number(row.age) < filters.min) return false;
    if (filters.max !== null && Number(row.age) > filters.max) return false;
  }
  if (filters.sex && normalizedSex(row.sex) !== filters.sex) return false;
  return true;
}
async function sample(descriptor, total, filters, signal) {
  const filtered =
    filters.min !== null || filters.max !== null || !!filters.sex;
  if (!filtered) {
    const response = await getRows(descriptor, randomInt(total), 1, signal);
    return {
      item: response.data.rows[0],
      revision: response.revision,
      partial: response.data.partial === true,
      total: response.data.num_rows_total,
      examined: 1,
      filtered: false,
    };
  }
  const seen = new Set();
  for (let round = 0; round < 3; round++) {
    const start = randomInt(total),
      length = Math.min(100, total),
      firstLength = Math.min(length, total - start);
    const first = await getRows(descriptor, start, firstLength, signal);
    let rows = first.data.rows.slice(),
      partial = first.data.partial === true;
    if (firstLength < length) {
      const second = await getRows(descriptor, 0, length - firstLength, signal);
      if (second.revision !== first.revision)
        throw problem("revisionChangedDuringDraw");
      rows.push(...second.data.rows);
      partial ||= second.data.partial === true;
    }
    const fresh = rows.filter((item) => !seen.has(item.row_idx));
    fresh.forEach((item) => seen.add(item.row_idx));
    const item = shuffle(fresh).find((item) => matches(item.row, filters));
    if (item)
      return {
        item,
        revision: first.revision,
        partial,
        total: first.data.num_rows_total,
        examined: seen.size,
        filtered: true,
      };
    if (seen.size >= total) break;
  }
  throw problem("noMatch", { count: formatNumber(seen.size) });
}
function preferredSplit(dataset, splits) {
  const entry = state.catalog.get(dataset);
  const desired = entry?.splits?.[0];
  return (
    splits.find(
      (item) =>
        desired &&
        item.config === desired.config &&
        item.split === desired.split,
    ) ||
    splits.find((item) => item.split === "train") ||
    splits[0]
  );
}
function acceptResult(descriptor, pair, response, filters, scope, metadata) {
  if (response.item.truncated_cells?.length) throw problem("truncatedDraw");
  if (
    metadata.revision &&
    response.revision &&
    metadata.revision !== response.revision
  )
    state.metadata.delete(descriptor.dataset);
  const total =
    Number.isSafeInteger(response.total) && response.total > 0
      ? response.total
      : pair.num_rows;
  state.current = {
    ...descriptor,
    offset: response.item.row_idx,
    uuid: hasValue(response.item.row.uuid)
      ? String(response.item.row.uuid)
      : "",
    revision: response.revision,
    row: response.item.row,
    total,
    filters,
    scope,
    partial: metadata.partial || response.partial,
  };
  renderOutput();
}
async function draw(historyMode = "push") {
  let filters;
  try {
    filters = makeFilters(el.minAge.value, el.maxAge.value, el.sex.value);
  } catch (error) {
    sayError(error);
    return;
  }
  const scope = el.country.value,
    chosenSplit = el.split.value;
  await runJob(async (signal) => {
    const countries = [...state.catalog.keys()],
      dataset =
        scope === "all" ? countries[randomInt(countries.length)] : scope;
    ensureDataset(dataset);
    const metadata = await getMetadata(dataset, signal);
    const pair =
      scope === "all"
        ? preferredSplit(dataset, metadata.splits)
        : metadata.splits.find((item) => splitKey(item) === chosenSplit);
    if (!pair) {
      renderSplits();
      throw problem("splitsChanged");
    }
    const descriptor = { dataset, config: pair.config, split: pair.split };
    const response = await sample(descriptor, pair.num_rows, filters, signal);
    cancelled(signal);
    acceptResult(descriptor, pair, response, filters, scope, metadata);
    if (scope !== "all") renderSplits(splitKey(pair));
    writeURL(historyMode);
    clearStatus();
  });
}
/* Pure, conservative extraction from existing text. Returns '' if uncertain.
 * This is a display helper; it never changes or supplies source row fields.
 */
function extractName(row, dataset, split) {
  for (const key of ["full_name", "name"]) {
    if (typeof row?.[key] === "string" && row[key].trim())
      return row[key].trim();
  }
  const fields = [
    "persona",
    "professional_persona",
    "linguistic_persona",
    "family_persona",
    "sports_persona",
    "arts_persona",
    "travel_persona",
    "culinary_persona",
  ];
  const texts = fields
    .map((key) => (typeof row?.[key] === "string" ? row[key].trim() : ""))
    .filter(Boolean);
  if (!texts.length) return "";
  const country = String(dataset || "")
    .split("/")
    .pop()
    .replace(/^Nemotron-Personas-/, "");
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = (text, name) =>
    new RegExp(
      "(?:^|[^\\p{L}\\p{M}])" + escape(name) + "(?=$|[^\\p{L}\\p{M}])",
      "u",
    ).test(text);
  const support = (name) => texts.filter((text) => boundary(text, name)).length;
  const starts = (name) =>
    texts.filter(
      (text) =>
        text.startsWith(name) &&
        !/^[\p{L}\p{M}]/u.test(text.slice(name.length)),
    ).length;
  const common = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  };

  if (country === "Japan") {
    const chars =
      "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}々〆ヵヶー]";
    const pattern = new RegExp(
      "^(" +
        chars +
        "{1,10}[ \\u3000]+" +
        chars +
        "{1,14})(?:さん|氏)?は(?:[、,]|$)",
      "u",
    );
    const primary = texts[0].match(pattern);
    if (primary) return primary[1];
    const candidates = [];
    for (const text of texts) {
      const found = text.match(pattern);
      if (found) candidates.push(found[1]);
    }
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const found = common(texts[i], texts[j]).trimEnd().match(pattern);
        if (found) candidates.push(found[1]);
      }
    return (
      candidates.sort(
        (a, b) => support(b) - support(a) || b.length - a.length,
      )[0] || ""
    );
  }
  if (country === "Korea") {
    for (const text of texts) {
      const found = text.match(
        /^([\p{Script=Hangul}]{2,8}(?:[ \u3000][\p{Script=Hangul}]{1,8})?)\s*(?:씨|님)(?:는|은|이|가|의|[ ,])/u,
      );
      if (found) return found[1];
    }
    return "";
  }

  const atom = "[\\p{Lu}\\p{Lt}][\\p{L}\\p{M}’'\\-‑]*";
  const token = "(?:" + atom + '|[“"]' + atom + '[”"])';
  const particle =
    "(?:de|da|do|dos|das|del|della|van|von|der|den|di|du|des|le|la|bin|binti|al)";
  const namePattern =
    token +
    "(?:\\s+(?:" +
    particle +
    "\\s+)*" +
    token +
    "){0,7}(?:\\s*\\(" +
    atom +
    "(?:\\s+" +
    atom +
    "){0,5}\\))?";
  const headPattern = new RegExp("^(" + namePattern + ")", "u");

  if (country === "Vietnam") {
    const subjects = [row.persona, row.professional_persona]
      .filter((value) => typeof value === "string")
      .map((value) => value.slice(0, 400));
    const vietnamName = atom + "(?:\\s+" + atom + "){0,6}";
    const predicate =
      "(?:là|sống|đang|đã|hiện|vừa|luôn|mới|vẫn|dành|thường|từng|bắt|thích|thức|ở)";
    const person = new RegExp(
      "(?:^|[^\\p{L}\\p{M}])(?:Anh|anh|Chị|chị|Cô|cô|Bà|bà|Ông|ông|Chú|chú|Bác|bác)(?:\\s+là)?\\s+(" +
        vietnamName +
        ")(?=\\s+" +
        predicate +
        "(?:\\s|[,.;!?]|$)|,\\s*\\d)",
      "gu",
    );
    for (const text of subjects) {
      const found = person.exec(text);
      person.lastIndex = 0;
      if (found) return found[1];
    }
    const direct = new RegExp(
      "^(" +
        atom +
        "(?:\\s+" +
        atom +
        "){1,6})(?=\\s+" +
        predicate +
        "(?:\\s|[,.;!?]|$)|,\\s*\\d)",
      "u",
    );
    for (const text of subjects) {
      const found = text.match(direct);
      if (found) return found[1];
    }
    const afterComma = new RegExp(
      ",\\s*(" + vietnamName + ")(?=\\s+" + predicate + "(?:\\s|[,.;!?]|$))",
      "gu",
    );
    for (const text of subjects)
      for (const found of text.matchAll(afterComma))
        if (support(found[1]) >= 2) return found[1];
    return "";
  }

  if (
    split === "hi_Deva_IN" ||
    /\p{Script=Devanagari}/u.test(texts[0].slice(0, 30))
  ) {
    const stop = new Set(
      "एक अपने अपनी उनकी उनके उसका उसकी उनके वे वह यह और या जो हैं है का की के को में से पर ने साथ लिए साल वर्ष वर्षीय अनुभवी कुशल अनुशासित शांत व्यवस्थित जिज्ञासु गाँव गांव ग्रामीण लोक कला".split(
        " ",
      ),
    );
    const candidates = new Set();
    for (const text of texts)
      for (const chunk of text.slice(0, 220).split(/[,，]/).slice(0, 4)) {
        const words = chunk.trim().split(/\s+/);
        let prefix = [];
        for (const word of words.slice(0, 5)) {
          if (stop.has(word) || !/^[\p{Script=Devanagari}\p{M}]+$/u.test(word))
            break;
          prefix.push(word);
          if (prefix.length >= 2) candidates.add(prefix.join(" "));
        }
      }
    const ranked = [...candidates]
      .map((name) => ({ name, score: support(name) }))
      .filter((item) => item.score >= 3);
    ranked.sort((a, b) => b.score - a.score || b.name.length - a.name.length);
    return ranked[0]?.name || "";
  }

  const blocked = new Set(
    "A An The This That They Their He His Her She It At In On For With From By To As Of While Although Despite Eager Known Born Raised Calm Un Une Le La Les Il Elle Ce Cet Cette En Con Como Entre Tras Cada Al Una Uno Um Uma O Os As De Do Da Ele Ela Seu Sua Sa Son Ses Pour Au Aux Haar Hij Zij Zijn Het Een Op Als Voor Mit Im Am Der Die Das Er Sie Ihr Ihre Sein Seine Beim Für Ek Dheerta Méthodique"
      .toLowerCase()
      .split(" "),
  );
  const candidates = [];
  for (let index = 0; index < texts.length; index++) {
    const text = texts[index].replace(/^(?:Mr|Mrs|Ms|Dr|Prof)\.\s+/, "");
    const found = text.match(headPattern);
    if (!found) continue;
    const name = found[1].trim();
    if (
      name.length > 100 ||
      /['’]s$/u.test(name) ||
      blocked.has(name.split(/\s+/)[0].toLowerCase())
    )
      continue;
    const repeated = starts(name),
      words = name.split(/\s+/).length;
    if (index === 0 && words >= 2) return name;
    if (repeated >= 2 || (index === 0 && words >= 2))
      candidates.push({ name, score: repeated });
  }
  candidates.sort((a, b) => b.score - a.score || b.name.length - a.name.length);
  const seed = candidates[0]?.name;
  if (!seed) return "";
  // Expand a repeated given name only from the main persona narrative.
  // Other persona fields may mention artists or sports figures with that name.
  const expansions = [];
  for (const found of String(row.persona || "")
    .slice(0, 400)
    .matchAll(new RegExp(namePattern, "gu"))) {
    const candidate = found[0].trim();
    if (
      candidate === seed ||
      candidate.startsWith(seed + " ") ||
      candidate.startsWith(seed + "(")
    )
      expansions.push(candidate);
  }
  return (
    expansions
      .filter((name) => name.length <= 100)
      .sort((a, b) => b.length - a.length)[0] || seed
  );
}
function outputText(current, view) {
  const row = current.row;
  if (view === "json") return JSON.stringify(row, null, 2);
  const sections = [];
  if (view === "all") {
    for (const [key, value] of Object.entries(row))
      sections.push(`[${key}]\n${valueText(value)}`);
  } else {
    if (hasValue(row.persona))
      sections.push(`【${t("personaLabel")}】\n${valueText(row.persona)}`);
    const basics = BASIC_KEYS.filter((key) => hasValue(row[key])).map(
      (key) =>
        `${I18N[state.ui].fields[key] || I18N.en.fields[key] || key}: ${valueText(row[key])}`,
    );
    if (basics.length)
      sections.push("【" + t("basicInfo") + "】\n" + basics.join("\n"));
    for (const key of BACKGROUND_KEYS)
      if (hasValue(row[key]))
        sections.push(
          `【${I18N[state.ui].fields[key] || I18N.en.fields[key] || key}】\n${valueText(row[key])}`,
        );
    if (!sections.length)
      for (const [key, value] of Object.entries(row))
        if (hasValue(value)) sections.push(`[${key}]\n${valueText(value)}`);
  }
  return sections.join("\n\n");
}
function renderOutput() {
  for (const button of formatButtons)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === state.view),
    );
  el.output.dataset.format = state.view;
  el.output.dir = state.view === "background" ? "auto" : "ltr";
  renderPrompts();
  if (!state.current) {
    el.personaName.textContent = t("persona");
    document.title = t("siteTitle");
    return;
  }
  const current = state.current,
    name = extractName(current.row, current.dataset, current.split);
  el.output.value = outputText(current, state.view);
  el.personaName.textContent = name || t("unknownName");
  document.title = name ? `${name} # ${t("siteTitle")}` : t("siteTitle");
}
function makeURL() {
  const current = state.current,
    url = new URL(location.href);
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries({
    dataset: current.dataset,
    config: current.config,
    split: current.split,
    offset: current.offset,
    uuid: current.uuid,
    rev: current.revision,
    view: state.view,
    ui: state.ui,
  }))
    if (value !== "") url.searchParams.set(key, String(value));
  if (current.scope === "all") url.searchParams.set("scope", "all");
  if (current.filters.min !== null)
    url.searchParams.set("min_age", String(current.filters.min));
  if (current.filters.max !== null)
    url.searchParams.set("max_age", String(current.filters.max));
  if (current.filters.sex) url.searchParams.set("sex", current.filters.sex);
  return url.href;
}
function writeURL(mode = "replace") {
  if (!state.current) return;
  state.url = makeURL();
  try {
    if (mode === "push" && location.href !== state.url)
      history.pushState(null, "", state.url);
    else history.replaceState(null, "", state.url);
    state.addressWritable = true;
  } catch {
    state.addressWritable = false;
  }
}
function parseReplay(input, allowEmpty = false) {
  let value = String(input || "").trim();
  if (value.startsWith("dataset=")) value = "?" + value;
  let params;
  try {
    params = new URL(value || location.href, location.href).searchParams;
  } catch {
    throw problem("invalidURL");
  }
  if (!params.has("dataset") && !params.has("offset") && allowEmpty)
    return null;
  const dataset = params.get("dataset"),
    config = params.get("config") || "default",
    split = params.get("split") || "train",
    offsetText = params.get("offset");
  if (!safeDataset(dataset)) throw problem("invalidReplayDataset");
  if (
    !offsetText ||
    !/^\d+$/.test(offsetText) ||
    !Number.isSafeInteger(Number(offsetText))
  )
    throw problem("invalidOffset");
  if (config.length > 200 || split.length > 200 || !config || !split)
    throw problem("invalidSplit");
  const revision = params.get("rev") || "",
    uuid = params.get("uuid") || "",
    view = params.get("view") || "background";
  if (revision && !/^[a-fA-F0-9]{7,64}$/.test(revision))
    throw problem("invalidRevision");
  if (uuid.length > 200 || /[\u0000-\u001f]/.test(uuid))
    throw problem("invalidUUID");
  if (!FORMATS.includes(view)) throw problem("invalidView");
  return {
    dataset,
    config,
    split,
    offset: Number(offsetText),
    revision,
    uuid,
    view,
    ui: resolveUILanguage(params.get("ui")) || state.ui,
    scope: params.get("scope") === "all" ? "all" : dataset,
    filters: makeFilters(
      params.get("min_age"),
      params.get("max_age"),
      params.get("sex"),
    ),
  };
}
async function restore(input, historyMode = "replace") {
  let replay;
  try {
    replay = parseReplay(input);
  } catch (error) {
    sayError(error);
    return;
  }
  applyLanguage(replay.ui, { syncURL: false });
  await runJob(async (signal) => {
    const metadata = await getMetadata(replay.dataset, signal),
      pair = metadata.splits.find(
        (item) => item.config === replay.config && item.split === replay.split,
      );
    if (!pair) throw problem("replaySplitMissing");
    if (replay.offset >= pair.num_rows)
      throw problem("offsetOutOfRange", {
        max: formatNumber(pair.num_rows - 1),
      });
    const response = await getRows(replay, replay.offset, 1, signal),
      item = response.data.rows[0];
    if (item.row_idx !== replay.offset) throw problem("wrongRow");
    if (replay.revision && replay.revision !== response.revision)
      throw problem(
        response.revision ? "replayRevisionMismatch" : "replayRevisionMissing",
      );
    if (replay.uuid && replay.uuid !== String(item.row.uuid ?? ""))
      throw problem("replayUUIDMismatch");
    if (item.truncated_cells?.length) throw problem("truncatedReplay");
    cancelled(signal);
    ensureDataset(replay.dataset);
    state.view = replay.view;
    renderCountries(replay.scope);
    renderSplits(splitKey(replay));
    el.minAge.value = replay.filters.min ?? "";
    el.maxAge.value = replay.filters.max ?? "";
    el.sex.value = replay.filters.sex;
    el.filtersDetails.open =
      replay.filters.min !== null ||
      replay.filters.max !== null ||
      !!replay.filters.sex;
    acceptResult(
      replay,
      pair,
      {
        item,
        revision: response.revision,
        partial: response.data.partial === true,
        total: response.data.num_rows_total,
      },
      replay.filters,
      replay.scope,
      metadata,
    );
    writeURL(historyMode);
    clearStatus();
  });
}
async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    clearStatus();
    return;
  } catch {
    /* file:// and permission fallback below */
  }
  const previous = document.activeElement,
    temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.style.cssText =
    "position:fixed;left:0;top:0;opacity:0;pointer-events:none;";
  document.body.append(temporary);
  temporary.focus();
  temporary.select();
  let copied = false;
  try {
    copied = !!document.execCommand?.("copy");
  } catch {
    /* manual fallback */
  }
  temporary.remove();
  previous?.focus();
  if (copied) {
    clearStatus();
    return;
  }
  el.manualCopy.value = text;
  if (typeof el.copyDialog.showModal === "function") {
    if (!el.copyDialog.open) el.copyDialog.showModal();
  } else el.copyDialog.setAttribute("open", "");
  el.manualCopy.focus();
  el.manualCopy.select();
}
function download() {
  if (!state.current) return;
  const json = state.view === "json",
    blob = new Blob([el.output.value], {
      type: json
        ? "application/json;charset=utf-8"
        : "text/plain;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `persona-${state.current.dataset.slice(PREFIX.length)}-${state.current.split}-${state.current.offset}.${json ? "json" : "txt"}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  clearStatus();
}
async function refreshCatalog() {
  const controller = new AbortController();
  try {
    const { data } = await getJSON(CATALOG_URL, controller.signal, {
      timeout: 8000,
      retries: 0,
    });
    if (!Array.isArray(data)) return;
    let added = false;
    for (const item of data)
      if (safeDataset(item.id)) {
        if (!state.catalog.has(item.id)) {
          ensureDataset(item.id);
          added = true;
        }
        const license = item.tags
          ?.find((tag) => typeof tag === "string" && tag.startsWith("license:"))
          ?.slice(8);
        if (license) state.catalog.get(item.id).license = license;
      }
    if (added) renderCountries();
    if (state.current) renderOutput();
  } catch {
    /* The built-in official dataset list remains available. */
  }
}
el.drawForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.busy) void draw();
});
el.country.addEventListener("change", () => {
  renderSplits();
  clearStatus();
});
el.split.addEventListener("change", clearStatus);
el.resetFilters.addEventListener("click", () => {
  el.minAge.value = "";
  el.maxAge.value = "";
  el.sex.value = "";
  clearStatus();
});
el.cancelButton.addEventListener("click", () => state.abort?.abort());
for (const button of formatButtons)
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    renderOutput();
    writeURL();
  });
el.copyButton.addEventListener("click", () => {
  if (state.current) void copyText(el.output.value);
});
el.copyUrlButton.addEventListener("click", () => {
  if (state.current) void copyText(state.url || makeURL());
});
el.downloadButton.addEventListener("click", download);
el.selectManualCopy.addEventListener("click", () => {
  el.manualCopy.focus();
  el.manualCopy.select();
});
el.closeCopyDialog.addEventListener("click", () => {
  if (typeof el.copyDialog.close === "function") el.copyDialog.close();
  else el.copyDialog.removeAttribute("open");
});
window.addEventListener("popstate", () => {
  let replay;
  try {
    replay = parseReplay(location.href, true);
  } catch (error) {
    state.job++;
    state.abort?.abort();
    state.abort = null;
    setBusy(false);
    sayError(error);
    return;
  }
  if (replay) void restore(location.href);
  else {
    applyLanguage(initialLanguage(), { syncURL: false });
    void draw("replace");
  }
});
el.uiLanguage.addEventListener("change", () =>
  applyLanguage(el.uiLanguage.value),
);
el.copyEnglishPrompt.addEventListener("click", () => {
  if (state.current && !state.busy) void copyText(el.englishPrompt.value);
});
el.copyLocalPrompt.addEventListener("click", () => {
  if (state.current && !state.busy && !el.localPromptDetails.hidden)
    void copyText(el.localPrompt.value);
});
applyLanguage(initialLanguage(), { syncURL: false });
setBusy(false);
void refreshCatalog();
try {
  const replay = parseReplay(location.href, true);
  if (replay) void restore(location.href);
  else void draw("replace");
} catch (error) {
  sayError(error);
}
