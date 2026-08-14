/**
 * backend から届くデータの形。
 *
 * **これは backend が持つ契約の写しであって、契約そのものではない。**
 * structuredContent は backend/app/mcp_server/views.py の pydantic モデルを
 * `model_dump(mode="json", by_alias=True)` した結果、_meta.ui は
 * backend/app/mcp_server/ui_assets.py の build_search_ui_items() /
 * build_product_ui_item() が組み立てた辞書がそのまま届く。
 * **変えるときは必ず backend 側が先で、ここはそれに追随するだけ。**
 * この型を直して backend が返す形が変わることは無い（TypeScript の型は実行時に
 * 何も検査しない。ここで嘘をつくと、View は嘘の形を信じたまま描画して壊れる）。
 *
 * pydantic の model_dump は既定値のフィールドも必ず出力する。したがって
 * `category: str | None = None` は「キーが無い」ではなく `"category": null` として
 * 届く——省略可能（`?`）ではなく `| null` で受けるのが正しい。
 */

/**
 * views.ProductBrief — 検索結果1件ぶん。LLM が読む前提で軽くしてある
 * （**画像は入らない**。views.py の「重いものは一覧に出さない・画像は詳細ツールだけ」規律）。
 */
export interface ProductBrief {
  id: number;
  name: string;
  /** カテゴリ名。LLM は category_id を読めないので名前で返している。 */
  category: string | null;
  /** 実売価格。金額の基準はこれ1本（sale_price があればそれ、無ければ price）。 */
  effective_price: number;
  /** セール中のときだけ元値（= Product.price）。打ち消し表示の材料。非セールは null。 */
  list_price: number | null;
  stock: number;
  /** draft / coming_soon / on_sale / suspended / discontinued / archived のいずれか。 */
  status: string;
  purchasable: boolean;
  /**
   * 「購入できます」または買えない理由の完成文。
   * **View で組み立て直さないこと。** 文言の唯一の源は backend の
   * services/cart.py の availability_reason_for_status で、stock / status から
   * 「在庫◯点」「販売終了」のような文言を View 側で新たに作ると、同じ判断が
   * 二重に実装されて必ず片方が古くなる。View がやってよいのは色分けだけ。
   */
  availability: string;
  avg_rating: number | null;
  review_count: number;
}

/** views.ProductSearchResult — search_products の structuredContent。 */
export interface ProductSearchResult {
  items: ProductBrief[];
  total: number;
  page: number;
  limit: number;
  /**
   * 価格帯の申し送り（定価で評価している旨）、またはカテゴリ名が存在しないときの案内。
   * 無ければ null。カテゴリ不一致のときは items が空・total が 0 になるので、
   * 「0件」の表示と併せてここに理由が載る形になる。
   */
  note: string | null;
}

/** views.ProductDetail — get_product の structuredContent（ProductBrief を継承）。 */
export interface ProductDetail extends ProductBrief {
  sku: string | null;
  /** 300 文字で切られる（超過時は末尾に "…"）。改行を含みうる自由文。 */
  description: string | null;
  /**
   * "重量: 320g" の形に潰した文字列の配列。
   * **label / value の2キーに分けないこと**（backend 側の規律に表示側も倣う）。
   */
  specs: string[];
  /**
   * 相対パス（例 "/products/foo.svg"）。**描画には使わない**——iframe から見ると
   * 解決できるオリジンが無い。<img src> には _meta.ui 側の絶対URLを使う。
   * ここに載っているのは LLM 向けの参考情報。
   */
  image_url: string | null;
}

/** _meta.ui.items[] の1件（ui_assets.build_search_ui_items）。 */
export interface SearchUiItem {
  /**
   * structuredContent.items[].id と同じ値。
   * **突き合わせは必ずこの id で行う**（配列の添字で対応づけないこと）。
   */
  id: number;
  /** FRONTEND_ORIGIN を前置した絶対URL。画像が無い商品は null。 */
  image_url: string | null;
  /** `${FRONTEND_ORIGIN}/products/${id}`。必ず存在する。 */
  page_url: string;
}

/** _meta.ui — search_products。 */
export interface SearchUiMeta {
  items: SearchUiItem[];
}

/**
 * _meta.ui — get_product（ui_assets.build_product_ui_item）。単数のオブジェクト。
 *
 * image_url は structuredContent 側の image_url（相対パス）とは別物で、絶対URL化して
 * iframe の <img src> にそのまま使える値になっている。**同じ名前が両方に出るのは
 * 重複ではなく役割の違い**——前者は LLM 向けの参考情報、後者は描画専用。
 * search の ProductBrief は画像を一切持たないので、そちらとは事情が異なる。
 * page_url は structuredContent のどのフィールドにも対応が無い。
 */
export interface ProductUiMeta {
  image_url: string | null;
  page_url: string;
}

/** search_products の sort 引数（tools.search_products の signature の写し）。 */
export type SortKey = "newest" | "price_asc" | "price_desc" | "rating" | "recommended";

/** search_products のツール引数。 */
export interface SearchProductsArgs {
  /** max_length=100 */
  query?: string;
  /** max_length=64。カテゴリ名またはスラグ。 */
  category?: string;
  /** >= 0 */
  min_price?: number;
  /** >= 0 */
  max_price?: number;
  sort?: SortKey;
  /** >= 1（既定 1） */
  page?: number;
  /** 1..30（既定 10） */
  limit?: number;
}

/** get_product のツール引数。 */
export interface GetProductArgs {
  /** >= 1 */
  product_id: number;
}
