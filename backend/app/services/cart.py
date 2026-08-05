"""カートへの一括投入と、ゲストカートの明細解決。

複数明細をまとめてカートへ入れる経路が 2 つある（過去の注文からの再注文と、ゲスト
カートのログイン時マージ）。在庫の引き当て判定を経路ごとに書くと、片方だけ直したときに
売り越しが起きるため、判定はこのモジュールに 1 つだけ置く。

ゲスト（未ログイン）のカートは端末の localStorage が持ち、サーバーには「商品IDと数量の
並び」だけが届く。金額は必ず effective_price から計算する決まりなので、価格・購入可否・
在庫の判断をクライアントに写すことはしない（二重実装になり、必ずどちらかが古くなる）。
解決は resolve_guest_lines() に集約し、フロントは返ってきた数量と金額をそのまま描く。
"""

from dataclasses import dataclass
from typing import Sequence

from sqlalchemy.orm import Session

from app.models import CartItem, Product
from app.schemas import CartLineResultOut, GuestCartItemOut, GuestCartOut, ProductOut


@dataclass(frozen=True)
class CartLineRequest:
    """カートへ入れたい 1 明細。"""

    product_id: int
    quantity: int
    # 商品が取得できない・買えないときに結果へ載せる表示名。再注文は注文明細の
    # スナップショット名を渡す（商品が消えていても名前を出せる）。ゲストカートは
    # 名前を持たないので None を渡し、商品マスタの名前を使う。
    fallback_name: str | None = None


def addable_quantity(requested: int, stock: int, already_in_cart: int) -> int:
    """在庫と既存カート数から、実際に追加できる数量を返す（0 以上）。"""
    return max(0, min(requested, stock - already_in_cart))


def shortage_reason(added: int, requested: int) -> str | None:
    """要求数を満たせなかった理由。満たせた場合は None。"""
    if added >= requested:
        return None
    return f"在庫が不足するため{added}点のみ追加しました"


def unavailable_reason(product: Product | None) -> str | None:
    """その商品をいまカートに入れられない理由。入れられる場合は None。

    可否そのものは models.py の is_viewable / is_on_sale が唯一の源で、ここが持つのは
    文言だけ。status を直接比較し直さないこと——販売可能な状態を 1 つ増やしたときに、
    商品ページの購入ボタン（ProductOut.purchasable）とカートの判定がずれる。

    状態は在庫より先に見る。販売停止かつ在庫切れのときに「在庫切れ」と言うと、在庫を
    足せば買えるように読めてしまうため。
    """
    if product is None or not product.is_viewable:
        return "お取り扱いが終了しました"
    if not product.is_on_sale:
        return "現在購入できません"
    if product.stock <= 0:
        return "在庫切れです"
    return None


def _display_name(line: CartLineRequest, product: Product | None) -> str:
    if line.fallback_name:
        return line.fallback_name
    if product is not None:
        return product.name
    return f"商品 #{line.product_id}"


def merge_lines(
    db: Session,
    user_id: int,
    lines: Sequence[CartLineRequest],
) -> tuple[list[CartLineResultOut], list[CartLineResultOut]]:
    """明細をまとめてカートへ入れ、(追加できたもの, 見送ったもの) を返す。

    買えない明細はエラーにせず理由とともに見送る（1 件の在庫切れで一括投入そのものを
    失敗させると、他の明細まで失われる）。在庫判定中に他の注文と競合しないよう対象商品の
    行をロックするが、commit はしない（呼び出し側のトランザクション境界に委ねる）。
    """
    added: list[CartLineResultOut] = []
    skipped: list[CartLineResultOut] = []
    if not lines:
        return added, skipped

    products = (
        db.query(Product)
        .filter(Product.id.in_([line.product_id for line in lines]))
        .order_by(Product.id)
        .with_for_update()
        .all()
    )
    products_by_id = {p.id: p for p in products}

    cart_items_by_product = {
        item.product_id: item
        for item in db.query(CartItem).filter(CartItem.user_id == user_id).all()
    }
    # 同じ商品の明細が複数ある場合、この dict の数量は 1 件目の追加ぶんが加算済みなので
    # 2 件目以降の在庫判定にもこのリクエストでの追加分が反映される。

    for line in lines:
        product = products_by_id.get(line.product_id)
        name = _display_name(line, product)

        reason = unavailable_reason(product)
        if reason is not None:
            skipped.append(
                CartLineResultOut(
                    product_id=line.product_id,
                    product_name=name,
                    quantity=0,
                    reason=reason,
                )
            )
            continue
        assert product is not None  # unavailable_reason が None を弾いている

        cart_item = cart_items_by_product.get(line.product_id)
        in_cart = cart_item.quantity if cart_item else 0
        add_quantity = addable_quantity(line.quantity, product.stock, in_cart)
        if add_quantity <= 0:
            skipped.append(
                CartLineResultOut(
                    product_id=line.product_id,
                    product_name=name,
                    quantity=0,
                    reason="すでにカートに在庫数分入っています",
                )
            )
            continue

        if cart_item is not None:
            cart_item.quantity += add_quantity
        else:
            cart_item = CartItem(
                user_id=user_id,
                product_id=line.product_id,
                quantity=add_quantity,
            )
            db.add(cart_item)
            cart_items_by_product[line.product_id] = cart_item

        added.append(
            CartLineResultOut(
                product_id=line.product_id,
                product_name=name,
                quantity=add_quantity,
                reason=shortage_reason(add_quantity, line.quantity),
            )
        )

    return added, skipped


def resolve_guest_lines(
    db: Session, lines: Sequence[CartLineRequest]
) -> GuestCartOut:
    """ゲストカートの明細を商品・金額・在庫の実態に突き合わせて返す。

    在庫の引き当ては行わない（ゲストのカートは予約ではない）。数量が在庫を超える明細は
    在庫数まで丸め、買えない明細は数量 0 ＋理由で返す。商品そのものが引けない明細は
    dropped_product_ids で知らせ、フロントは端末側の控えからそれを消す。
    """
    if not lines:
        return GuestCartOut(items=[], total_amount=0, dropped_product_ids=[])

    products = (
        db.query(Product)
        .filter(Product.id.in_([line.product_id for line in lines]))
        .all()
    )
    products_by_id = {p.id: p for p in products}

    items: list[GuestCartItemOut] = []
    dropped: list[int] = []
    total_amount = 0

    for line in lines:
        product = products_by_id.get(line.product_id)
        # 商品ページごと消えている（物理削除・archived）明細は、名前も価格も出せない。
        # 行として見せる意味がないので落とす。
        if product is None or not product.is_viewable:
            dropped.append(line.product_id)
            continue

        product_out = ProductOut.model_validate(product)
        reason = unavailable_reason(product)
        if reason is not None:
            items.append(
                GuestCartItemOut(
                    product=product_out,
                    quantity=0,
                    requested_quantity=line.quantity,
                    subtotal=0,
                    reason=reason,
                )
            )
            continue

        quantity = min(line.quantity, product.stock)
        subtotal = product.effective_price * quantity
        total_amount += subtotal
        items.append(
            GuestCartItemOut(
                product=product_out,
                quantity=quantity,
                requested_quantity=line.quantity,
                subtotal=subtotal,
                reason=(
                    None
                    if quantity == line.quantity
                    else f"在庫が残り{product.stock}点のため数量を調整しました"
                ),
            )
        )

    return GuestCartOut(
        items=items, total_amount=total_amount, dropped_product_ids=dropped
    )
