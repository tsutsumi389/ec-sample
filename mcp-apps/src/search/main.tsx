/**
 * search.html のエントリ。**取り付けだけを持つ**（画面は SearchView.tsx、
 * 状態とホストとの配線は useSearchView.ts）。
 *
 * 「SDK が読めなかった場合」の保険は持たない——import が解決できなければバンドル自体が
 * 出来上がらず、この画面が配信されることも無い（壊れた成果物を作らない責任は
 * scripts/check-dist.ts、dist が読めないときに素のツール登録へ落ちる責任は backend）。
 */

// CSS は shared → View 固有の順で読む（この順がそのままカスケードの順になる）。
// エントリ HTML 側にスタイルを直書きしないのは、両 View で共通の部分を
// shared/theme.css の1か所に保つため。
import "../shared/theme.css";
import "./search.css";

import { mountView } from "../shared/mount.tsx";
import { SearchView } from "./SearchView.tsx";

mountView(<SearchView />, "search.html");
