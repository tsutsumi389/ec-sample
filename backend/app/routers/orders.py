from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_visitor_id
from app.database import get_db
from app.models import Address, CartItem, Order, OrderItem, Product, User
from app.routers.cart import _get_cart
from app.routers.coupons import evaluate_coupon, get_coupon_by_code
from app.schemas import (
    OrderCreate,
    OrderDetailOut,
    OrderSummaryOut,
    ReorderItemOut,
    ReorderResultOut,
)
from app.services import analytics

router = APIRouter(prefix="/orders", tags=["orders"])


def _format_shipping_address(address: Address) -> str:
    return (
        f"{address.recipient_name}\n"
        f"〒{address.postal_code} {address.prefecture}{address.city}{address.address_line}\n"
        f"TEL: {address.phone}"
    )


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    current_user: User = Depends(get_current_user),
    visitor_id: str | None = Depends(get_visitor_id),
    db: Session = Depends(get_db),
) -> Order:
    cart_items = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id)
        .order_by(CartItem.id)
        .all()
    )
    if not cart_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="カートが空です")

    shipping_address = payload.shipping_address
    if payload.address_id is not None:
        address = (
            db.query(Address)
            .filter(Address.id == payload.address_id, Address.user_id == current_user.id)
            .first()
        )
        if address is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")
        shipping_address = _format_shipping_address(address)

    if not shipping_address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Shipping address is required"
        )

    try:
        product_ids = [item.product_id for item in cart_items]
        # Lock the involved product rows for the duration of this transaction so
        # concurrent orders cannot oversell the same stock.
        products = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
            .all()
        )
        products_by_id = {p.id: p for p in products}

        total_amount = 0
        order_items: list[OrderItem] = []

        for cart_item in cart_items:
            product = products_by_id.get(cart_item.product_id)
            if product is None or not product.is_viewable:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"商品が見つかりません: {cart_item.product_id}",
                )
            if product.status != "on_sale":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"この商品は現在購入できません: {product.name}",
                )
            if product.stock < cart_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"在庫が不足しています: {product.name}",
                )

            # 実売価格を採用し、注文時点の価格として OrderItem にスナップショットする。
            unit_price = product.effective_price
            product.stock -= cart_item.quantity
            total_amount += unit_price * cart_item.quantity
            order_items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    price=unit_price,
                    quantity=cart_item.quantity,
                )
            )

        discount_amount = 0
        coupon_code: str | None = None
        if payload.coupon_code:
            coupon = get_coupon_by_code(db, payload.coupon_code)
            valid, discount_amount, message = evaluate_coupon(coupon, total_amount)
            if not valid:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
            coupon_code = payload.coupon_code

        order = Order(
            user_id=current_user.id,
            total_amount=total_amount - discount_amount,
            discount_amount=discount_amount,
            coupon_code=coupon_code,
            status="pending",
            shipping_address=shipping_address,
            items=order_items,
        )
        db.add(order)

        for cart_item in cart_items:
            db.delete(cart_item)

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)

    # 購入をサーバー側で記録する。A/Bテストの主要指標であり、フロントの計測呼び出しに
    # 依存させると離脱・通信断・実装漏れでそのまま成果の欠損になるため、注文が確定した
    # この時点で確実に 1 件残す。value に注文金額を入れておくと、CV数と売上の両方を
    # このイベント 1 種類から集計できる。
    if visitor_id:
        analytics.record_server_event(
            db,
            visitor_id=visitor_id,
            name=analytics.EVENT_PURCHASE,
            user_id=current_user.id,
            value=float(order.total_amount),
            props={
                "order_id": order.id,
                "item_count": sum(item.quantity for item in order.items),
                "coupon_code": coupon_code,
            },
        )

    return order


@router.get("", response_model=list[OrderSummaryOut])
def list_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )


@router.get("/{order_id}", response_model=OrderDetailOut)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.post("/{order_id}/reorder", response_model=ReorderResultOut)
def reorder(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReorderResultOut:
    """過去の注文明細をカートへ再投入する（もう一度買う）。

    購入できない明細はエラーにせずスキップし、理由とともに返す。
    キャンセル済みの注文からの再注文も許可する。
    """
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    added: list[ReorderItemOut] = []
    skipped: list[ReorderItemOut] = []

    try:
        product_ids = [item.product_id for item in order.items]
        # 在庫判定中に他の注文と競合しないよう、対象商品の行をロックする。
        products = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
            .all()
        )
        products_by_id = {p.id: p for p in products}

        cart_items_by_product = {
            item.product_id: item
            for item in db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
        }
        # 同一注文に同じ商品の明細が複数ある場合は、この dict の数量が加算済みなので
        # 2 件目以降の在庫判定にもこのリクエストでの追加分が反映される。

        for item in order.items:
            # 商品名は注文時点のスナップショットを使う（商品が消えていても名前を出せる）。
            product = products_by_id.get(item.product_id)
            if product is None or not product.is_viewable:
                skipped.append(
                    ReorderItemOut(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=0,
                        reason="お取り扱いが終了しました",
                    )
                )
                continue
            if product.status != "on_sale":
                skipped.append(
                    ReorderItemOut(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=0,
                        reason="現在購入できません",
                    )
                )
                continue
            if product.stock <= 0:
                skipped.append(
                    ReorderItemOut(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=0,
                        reason="在庫切れです",
                    )
                )
                continue

            cart_item = cart_items_by_product.get(item.product_id)
            in_cart = cart_item.quantity if cart_item else 0
            addable = product.stock - in_cart
            if addable <= 0:
                skipped.append(
                    ReorderItemOut(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=0,
                        reason="すでにカートに在庫数分入っています",
                    )
                )
                continue

            add_quantity = min(item.quantity, addable)
            reason = (
                None
                if add_quantity == item.quantity
                else f"在庫が不足するため{add_quantity}点のみ追加しました"
            )

            if cart_item is not None:
                cart_item.quantity += add_quantity
            else:
                cart_item = CartItem(
                    user_id=current_user.id,
                    product_id=item.product_id,
                    quantity=add_quantity,
                )
                db.add(cart_item)
                cart_items_by_product[item.product_id] = cart_item

            added.append(
                ReorderItemOut(
                    product_id=item.product_id,
                    product_name=item.product_name,
                    quantity=add_quantity,
                    reason=reason,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return ReorderResultOut(cart=_get_cart(db, current_user), added=added, skipped=skipped)


@router.post("/{order_id}/cancel", response_model=OrderDetailOut)
def cancel_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status not in ("pending", "paid"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel this order"
        )

    try:
        product_ids = [item.product_id for item in order.items]
        products = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
            .all()
        )
        products_by_id = {p.id: p for p in products}

        for item in order.items:
            product = products_by_id.get(item.product_id)
            if product is not None:
                product.stock += item.quantity

        order.status = "cancelled"
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order
