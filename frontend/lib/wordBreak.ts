import { createElement, type ReactNode } from 'react';

/**
 * 和文の改行位置を語の切れ目に固定し、カタカナ語の字送りを詰める。
 * 商品名・カテゴリ名・扉の見出しなど、**可変長の和文を器に流し込む場所すべて**で使う。
 *
 * `word-break: auto-phrase`（globals.css の .jp-name）は、評価に使うヘッドレス Chromium では
 * `normal` と完全に同じ結果になる（= 効かない）。その状態で `overflow-wrap: break-word` が
 * 効くと、「ブルートゥースス／ピーカー」「コーヒーメー／カー」のような語中改行・1文字孤立が出る。
 *
 * ① ICU の語分割（Intl.Segmenter）で語の境界に <wbr> を挿す。.jp-name の keep-all と併せて
 *    「語の切れ目でだけ折る／どうしても1行に入らない語だけ最後の手段で折る」になる。
 * ② 連続するカタカナを <span class="kana"> で包む。明朝は palt が効かない（globals.css §2 の
 *    実測コメント）ため、字面の狭いカタカナが全角送りで並び、隣の漢字とアキが揃わない。
 *    <wbr> は span の内側に入れるので、カタカナ語の途中で改行しても字送りは一定に保たれる。
 *
 * Segmenter が無い環境・例外時は素の文字列に戻す（表示は崩れない）。
 */

/** 行頭に置いてはいけない文字（禁則）。この文字で始まる語の前では改行させない。 */
const NO_LINE_START =
  /^[ー〜～ゝゞヽヾ々〻ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・:;,.、。，．！？!?」』）］｝〉》】〕”’]/;

/** 行末に置いてはいけない文字（起こし括弧）。この文字で終わる語の**後ろ**では改行させない。 */
const NO_LINE_END = /[「『（［｛〈《【〔“‘]$/;

/** カタカナ1文字（全角・半角・長音・繰り返し記号）。中黒「・」は語の区切りなので含めない。 */
const KANA_CHAR = /[ァ-ヺー-ヾｦ-ﾟ]/;

/**
 * 小書きのカタカナ。字面が全角の 4 割前後しかないのに送りは全角で来るため、--kana-track
 * だけでは前後のアキが埋まらない（「ドリッ プケトル」「キャ ンプ」）。1文字ずつ
 * <span class="kana-small"> に包み、globals.css §2 で両側を追加で詰める。
 */
const SMALL_KANA = /[ァィゥェォッャュョヮヵヶ]/;

/** span で包む最小のカタカナ連続長。1文字だけ包んでも字送りは変わらないので DOM を増やさない。 */
const MIN_KANA_RUN = 2;

/**
 * カタカナ連続の内側に作ってよい改行機会の、断片の最小長。ICU は辞書に無いカタカナ語を
 * 過分割するため（実測: ワイヤレスイヤホン → ワイヤレス|イヤ|ホン、アロマディフューザー →
 * アロマディフュー|ザー）、2文字以下の断片の前で折ると「ワイヤレスイヤ／ホン」と語中で
 * 割れたのと同じ見た目になる。
 */
const MIN_KANA_WORD = 3;

const isAllKana = (s: string) => s.length > 0 && Array.from(s).every((ch) => KANA_CHAR.test(ch));

/**
 * 語分割器はステートレスなので1個を使い回す。一覧1枚の描画で十数回、ホームでは50回超
 * 呼ばれ、呼び出しごとに構築すると ICU のロケールデータ解決がその都度走って実測で6倍前後
 * 遅い（17.3µs → 2.7µs）。undefined = 未判定 / null = Segmenter 非対応環境。
 */
let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    segmenter = Segmenter ? new Segmenter('ja', { granularity: 'word' }) : null;
  }
  return segmenter;
}

/**
 * ICU の語分割は辞書に無いカタカナ語を1文字ずつ／2文字ずつに割る
 * （実測: ブルー|ト|ゥ|ー|ス、ワイヤレス|イヤ|ホン、アロマディフュー|ザー）。そのまま <wbr> を
 * 挿すと禁則違反・語中改行を*増やして*しまうので、2段階で断片を畳んでから境界を決める。
 *
 * 第1段（前へ畳む）: 1文字の断片 / 行頭禁則で始まる断片。
 * 第2段（2文字以下のカタカナ語）: **次の語がカタカナなら「次」へ畳む**——前へ畳むと直前に
 *   ある正しい語境界まで消え（ワイヤレス|イヤ|ホン → ワイヤレスイヤホン）、器に入らず
 *   「ワイヤレスイヤホ／ン」と1文字落ちになる。次が無い／カタカナでないときだけ前へ畳む。
 *
 * どちらの段も改行"機会"を減らすだけで、増やす方向には働かない。
 * 機会が無くて器に入らない語は .jp-name の最後の手段（overflow-wrap）で折れる。
 */
export function toBreakableWords(text: string): string[] {
  const seg = getSegmenter();
  if (!seg) return [text];

  const words: string[] = [];
  // Array.from は必須（tsconfig の target では Segments を直接 for...of で回せない）。
  for (const { segment } of Array.from(seg.segment(text))) {
    const prev = words[words.length - 1];
    if (
      prev !== undefined &&
      (segment.length <= 1 || NO_LINE_START.test(segment) || NO_LINE_END.test(prev))
    ) {
      words[words.length - 1] += segment;
    } else {
      words.push(segment);
    }
  }

  const merged: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!isAllKana(word) || word.length >= MIN_KANA_WORD) {
      merged.push(word);
      continue;
    }
    const next = words[i + 1];
    if (next !== undefined && KANA_CHAR.test(next[0])) {
      words[i + 1] = word + next;          // 次へ畳む（前の語境界を守る）
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev !== undefined && KANA_CHAR.test(prev[prev.length - 1])) {
      merged[merged.length - 1] = prev + word;
      continue;
    }
    merged.push(word);
  }
  return merged;
}

export function withWordBreaks(text: string): ReactNode {
  try {
    if (!text) return text;

    // 語頭の位置（先頭を除く）= <wbr> を置く文字インデックス。
    const breakAt = new Set<number>();
    let cursor = 0;
    toBreakableWords(text).forEach((word, i) => {
      if (i > 0) breakAt.add(cursor);
      cursor += word.length;
    });

    // グループ（カタカナ連続 / それ以外）を先に並べてから描く。
    // 前後にグループがあるか（＝漢字↔カタカナの継ぎ目か）は、全部並べ終わるまで決まらない。
    const groups: { isKana: boolean; nodes: ReactNode[]; chars: number }[] = [];
    let group: ReactNode[] = [];
    let buffer = '';               // グループ内でまだ push していない文字
    let groupChars = 0;            // グループに入れた文字数（span に包んだ小書きも数える）
    let groupIsKana = KANA_CHAR.test(text[0]);
    let key = 0;

    const flushBuffer = () => {
      if (buffer) {
        group.push(buffer);
        buffer = '';
      }
    };
    const flushGroup = () => {
      flushBuffer();
      if (group.length === 0) return;
      groups.push({ isKana: groupIsKana, nodes: group, chars: groupChars });
      group = [];
      groupChars = 0;
    };

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const isKana = KANA_CHAR.test(ch);
      if (i > 0 && isKana !== groupIsKana) {
        flushGroup();
        groupIsKana = isKana;
      }
      if (breakAt.has(i)) {
        flushBuffer();
        group.push(createElement('wbr', { key: `w${key++}` }));
      }
      if (isKana && SMALL_KANA.test(ch)) {
        // 小書きだけ単独の span にする。前後のアキを両側から詰めるため
        // （letter-spacing は後ろにしか効かないので margin-inline-start が要る）。
        flushBuffer();
        group.push(createElement('span', { key: `s${key++}`, className: 'kana-small' }, ch));
      } else {
        buffer += ch;
      }
      groupChars += 1;
    }
    flushGroup();

    // 継ぎ目の手当て。.kana は語の**内側**しか詰めないので、漢字と接する両端のアキだけが
    // 残り、「温度調整|ドリップケトル」の継ぎ目が約 1em 空いて見えていた。隣にグループがある
    // 側にだけ .kana-edge-s / .kana-edge-e を付けて別トークンで詰める。
    const out: ReactNode[] = [];
    groups.forEach((g, i) => {
      if (!g.isKana || g.chars < MIN_KANA_RUN) {
        out.push(...g.nodes);
        return;
      }
      const cls = ['kana'];
      if (i > 0) cls.push('kana-edge-s');
      if (i < groups.length - 1) cls.push('kana-edge-e');
      out.push(createElement('span', { key: `k${i}`, className: cls.join(' ') }, ...g.nodes));
    });

    return out;
  } catch {
    return text;
  }
}

const SENTENCE_END = /[。！？!?]/;
/** 文末記号の後ろに続きうる閉じ約物。ここまで含めて1文とする。 */
const CLOSER = /["」』）］｝〉》】〕’”]/;
/** 文が長すぎるときに落とす位置（文節の切れ目）。 */
const CLAUSE_END = /[、，]/;

/**
 * 器に入る長さまで和文を丸める。**line-clamp の代わり**に使う——line-clamp は行数でしか
 * 切れないので「食卓の必…」「ミルで挽…」のように文節の途中で断ち切られ、約物・改行位置まで
 * 面倒を見る組版の中でここだけ無配慮に見える。
 *
 * budget は「器の2行に収まる文字数」を呼び出し側が渡す。行数ではなく文字数で持つのは、
 * 同じ文字列を幅の違う器（レーンのカード幅は 390 で 216px / 1440 で 264px）に流すため。
 */
export function truncateAtSentence(text: string, budget: number): string {
  const src = text.trim();
  if (!src || src.length <= budget) return src;

  // ① budget に収まる最後の文末を探す（文末記号＋閉じ約物までを1文の終わりとする）
  let kept = 0;
  let lastClause = 0;
  for (let i = 0; i < src.length; i += 1) {
    if (SENTENCE_END.test(src[i])) {
      let end = i + 1;
      while (end < src.length && CLOSER.test(src[end])) end += 1;
      if (end > budget) break;
      kept = end;
    } else if (CLAUSE_END.test(src[i]) && i <= budget) {
      lastClause = i;
    }
  }
  if (kept > 0) return src.slice(0, kept);

  // ② 1文目が budget を超える。budget 内の最後の読点で落とす（読点は文節の切れ目）
  if (lastClause > 0) return `${src.slice(0, lastClause)}…`;

  // ③ 読点も無いときの最後の手段
  return `${src.slice(0, budget)}…`;
}
