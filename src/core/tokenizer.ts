/**
 * 轻量分词器（零第三方依赖）
 *
 * 设计取舍：
 *  - 英文/数字：小写化 → 去停用词 → 轻量词干化（不是完整 Porter，够用且可解释）
 *  - 中文：按字切 unigram/bigram。没有词典分词，但 bigram 已能覆盖多数检索场景，
 *    而且能避免引入 jieba 这类重依赖，保证 `npm i` 之后立刻可跑。
 *
 * 之所以自己写而不是直接用分词库，是因为面试时能讲清楚「词项归一化」到底做了什么。
 */

const STOPWORDS = new Set(
  (
    'a an the and or but if then than that this these those of in on at to for from by with without into over under ' +
    'as is are was were be been being it its their they them we you your he she his her i not no do does did ' +
    'can could should would may might must will shall about across after against among before between during through ' +
    'within also such more most other some any each both few many own same so only very just too via per ' +
    // 学术文本里的高频「废话词」，去掉后排序信噪比明显变好
    'paper papers study studies work works approach approaches method methods result results show shows shown ' +
    'propose proposes proposed present presents presented introduce introduces use uses used using based'
  ).split(/\s+/),
);

const CJK_RE = /[\u4e00-\u9fff]/;

/** 一段文本切成「中文连续段」或「拉丁词」，其余字符作为分隔符丢弃 */
const TOKEN_RE = /[\u4e00-\u9fff]+|[A-Za-z0-9]+(?:[.'-][A-Za-z0-9]+)*/g;

/** 后缀归并规则，按从长到短排列，命中即返回 */
const SUFFIXES: Array<[string, string]> = [
  ['ification', 'ify'],
  ['ational', 'ate'],
  ['ization', 'ize'],
  ['ations', 'ate'],
  ['ation', 'ate'],
  ['ements', ''],
  ['ement', ''],
  ['ments', ''],
  ['ment', ''],
  ['nesses', ''],
  ['ness', ''],
  ['ities', 'ity'],
  ['ings', ''],
  ['ing', ''],
  ['edly', ''],
  ['ed', ''],
  ['ies', 'y'],
  ['ly', ''],
];

/** embedd → embed：去掉后缀后如果结尾是重复辅音，还原成单写（ss/ll/zz 除外） */
function undouble(word: string): string {
  if (/([b-df-hj-km-np-rtv-z])\1$/.test(word)) return word.slice(0, -1);
  return word;
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const [suffix, replacement] of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return undouble(word.slice(0, word.length - suffix.length) + replacement);
    }
  }
  // 复数：boxes / processes / matches 这类要去掉整个 es
  if (/(?:ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(?:ss|us|is|as)$/.test(word) && word.length > 4) {
    return word.slice(0, -1);
  }
  return word;
}

function normalizeLatin(raw: string): string | null {
  const word = raw.toLowerCase().replace(/^[.'-]+|[.'-]+$/g, '');
  if (word.length < 2) return /\d/.test(word) ? word : null;
  if (STOPWORDS.has(word)) return null;
  const stemmed = stem(word);
  if (STOPWORDS.has(stemmed)) return null;
  return stemmed;
}

function cjkNgrams(run: string): string[] {
  const chars = Array.from(run);
  if (chars.length === 1) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i += 1) out.push(chars[i] + chars[i + 1]);
  return out;
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TOKEN_RE.exec(text);
  while (match !== null) {
    const segment = match[0];
    if (CJK_RE.test(segment)) {
      tokens.push(...cjkNgrams(segment));
    } else {
      const token = normalizeLatin(segment);
      if (token) tokens.push(token);
    }
    match = TOKEN_RE.exec(text);
  }
  return tokens;
}

/** 词频统计，索引构建和查询向量都复用 */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export function uniqueTerms(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

export { STOPWORDS };
