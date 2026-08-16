/**
 * search.html のエントリ。**取り付けだけを持つ**（画面は SearchView.tsx、
 * 状態とホストとの配線は useSearchView.ts）。
 *
 * ---- SDK の読み込みについて（移植で変わった点） ----
 * SDK は npm の @modelcontextprotocol/ext-apps から import する。かつては vendor した
 * バンドルを backend の ui_assets.build_app_html() が HTML へ差し込み、この画面は
 * globalThis.__McpAppSdk からそれを取り出していた。そのため「バンドルが差し込まれて
 * いない／壊れている」場合の保険として、body に「この画面の読み込みに失敗しました。」
 * とだけ出して止まる分岐を持っていた。
 * **その分岐は廃止済み。** import が解決できなければバンドル自体が出来上がらず、
 * この画面が配信されることも無いので、構造的に到達不能になったため。壊れた成果物を
 * 作らない責任は mcp-apps/scripts/check-dist.ts が、dist が読めないときに UI を諦めて
 * 素のツール登録へ落ちる責任は backend の ui_assets.py + apps_ui.register_fallback() が
 * 引き続き持っている。
 */

// CSS は shared → View 固有の順で読む（この順がそのままカスケードの順になる）。
// エントリ HTML 側にスタイルを直書きしないのは、両 View で共通の部分を
// shared/theme.css の1か所に保つため。
import "../shared/theme.css";
import "./search.css";

import { mountView } from "../shared/mount.tsx";
import { SearchView } from "./SearchView.tsx";

mountView(<SearchView />, "search.html");
