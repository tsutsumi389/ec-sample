"""MCP が直接呼ぶ既存ルーター関数の引数表を固定する（DB 不要・import 不要）。

MCP のツールは REST を経由せず `app/routers/` の関数を Python 呼び出しで使う。FastAPI の
依存注入は通らないので、**全引数をキーワードで明示的に渡さないと Depends オブジェクトが
そのまま値として流れ込む**。たとえば visitor_id を渡し忘れると record_server_event() が
壊れた行を書きにいき、analytics は例外を握って警告ログにするだけなので**無言で計測が壊れる**。
既存ルーターに `Depends(...)` 付きの引数が 1 本増えた日、REST は普通に動くのに MCP 経由だけが
壊れる。**このテストが落ちたら tools.py / checkout.py の呼び出しにも同じ引数を足すこと**
（EXPECTED を書き換えるだけで済ませない）。

ソースを ast で読むだけで **app パッケージを import しない**。app.routers を import すると
app.auth 経由で SECRET_KEY が要求され（fail closed）、鍵が無い環境では収集エラーで
**テストスイート全体が 1 件も走らなくなる**。
"""

import ast
import pathlib

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "app" / "routers"

# MCP から直接呼ぶ関数（モジュール名 → 関数名 → 呼び出し側が知っている引数名の全体）。
EXPECTED: dict[str, dict[str, set[str]]] = {
    # 商品（tools.search_products / tools.get_product）
    "products": {
        "list_products": {
            "search",
            "category_id",
            "sort",
            "min_price",
            "max_price",
            "page",
            "limit",
            "current_user",
            "db",
        },
        "get_product": {"product_id", "db"},
    },
    # カート（tools の各ツール）と、金額の源（checkout._quote が呼ぶ _get_cart）
    "cart": {
        "get_cart": {"current_user", "db"},
        "add_cart_item": {"payload", "current_user", "visitor_id", "db"},
        "update_cart_item": {"item_id", "payload", "current_user", "db"},
        "delete_cart_item": {"item_id", "current_user", "db"},
        "_get_cart": {"db", "user"},
    },
    # 配送先（tools.list_addresses / checkout._owned_addresses）
    "addresses": {"list_addresses": {"current_user", "db"}},
    # 注文（tools.list_orders / get_order / checkout.place_order）
    "orders": {
        "list_orders": {"current_user", "db"},
        "get_order": {"order_id", "current_user", "db"},
        "create_order": {"payload", "current_user", "visitor_id", "db"},
    },
    # カテゴリ（tools._categories）
    "categories": {"list_categories": {"db"}},
    # クーポン（checkout._quote）
    "coupons": {
        "get_coupon_by_code": {"db", "code"},
        "evaluate_coupon": {"coupon", "subtotal"},
    },
}


def _parameters(module: str, func: str) -> set[str]:
    """app/routers/<module>.py の関数 <func> の引数名を、import せずに読む。"""
    tree = ast.parse((ROUTERS / f"{module}.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func:
            args = node.args
            return {
                a.arg
                for a in [*args.posonlyargs, *args.args, *args.kwonlyargs]
            }
    raise AssertionError(f"app/routers/{module}.py に {func} が見つかりません")


def test_mcp_knows_every_parameter_of_the_routers_it_calls():
    mismatched = {
        f"{module}.{func}": {
            "actual": sorted(_parameters(module, func)),
            "expected": sorted(names),
        }
        for module, funcs in EXPECTED.items()
        for func, names in funcs.items()
        if _parameters(module, func) != names
    }
    assert not mismatched, mismatched
