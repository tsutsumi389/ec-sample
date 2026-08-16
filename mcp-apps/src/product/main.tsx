/**
 * product.html のエントリ。**取り付けだけを持つ**（画面は ProductView.tsx、
 * 状態とホストとの配線は useProductView.ts）。
 *
 * **SDK は npm の依存として import する。** かつては backend が vendor した
 * バンドルを HTML のプレースホルダに差し込み、View 側は globalThis.__McpAppSdk から
 * 受け取っていた。そのため「差し込まれていない・壊れている」場合の保険（body に
 * 「この画面の読み込みに失敗しました。」とだけ書いて何もしない分岐）が要った。
 * import になった今は解決できなければビルドが落ちるので、実行時にその状態は
 * 起こりえない。
 */

// CSS は theme.css（両 View 共通）→ product.css（この View 固有）の順に import する。
// **この順がそのままカスケードの順になる**ので入れ替えないこと。
import "../shared/theme.css";
import "./product.css";

import { mountView } from "../shared/mount.tsx";
import { ProductView } from "./ProductView.tsx";

mountView(<ProductView />, "product.html");
