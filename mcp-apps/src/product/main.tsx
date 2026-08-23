/**
 * product.html のエントリ。**取り付けだけを持つ**（画面は ProductView.tsx、
 * 状態とホストとの配線は useProductView.ts）。
 *
 * 「SDK が読めなかった場合」の保険は持たない——import が解決できなければビルドが
 * 落ちるので、実行時にその状態は起こりえない。
 */

// CSS は theme.css（両 View 共通）→ product.css（この View 固有）の順に import する。
// **この順がそのままカスケードの順になる**ので入れ替えないこと。
import "../shared/theme.css";
import "./product.css";

import { mountView } from "../shared/mount.tsx";
import { ProductView } from "./ProductView.tsx";

mountView(<ProductView />, "product.html");
