from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_visitor_id
from app.database import get_db
from app.models import Address, CartItem, Order, OrderItem, Product, User
from app.routers.cart import _get_cart
from app.routers.coupons import evaluate_coupon, get_coupon_by_code
from app.schemas import (
    CartMergeResultOut,
    OrderCreate,
    OrderDetailOut,
    OrderSummaryOut,
)
from app.services import analytics
from app.services import cart as cart_service
from app.services.shipping import format_shipping_address

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    current_user: User = Depends(get_current_user),
    visitor_id: str | None = Depends(get_visitor_id),
    db: Session = Depends(get_db),
) -> Order:
    # 既知の未対策: カート明細をロックせずに読むため、ブラウザのダブルサブミット（同じ
    # カートで注文が 2 回走る）は塞がっていない。塞ぐならここを with_for_update() にするが、
    # そのときは services/cart.merge_lines と同じ「商品行 → カート行」の順を守ること
    # （順序が交差するとデッドロックする）。MCP 経由は mcp_server/checkout.py が users 行を
    # 掴んで自衛しているので、ここを直したらあちらのロックも一緒に外すこと。
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
        shipping_address = format_shipping_address(address)

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
            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"商品が見つかりません: {cart_item.product_id}",
                )
            # 購入可否と在庫の判定は services/cart.py の 1 か所に置く（カート投入・決済前の
            # 下見・確定で規則がずれると、「カートには入るが買えない」「下見では買えたのに
            # 確定で落ちる」商品が生まれる）。
            reason = cart_service.order_blocker(product, cart_item.quantity)
            if reason is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{reason}: {product.name}",
                )

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

    # 購入は注文が確定したこの時点でサーバー側が 1 件残す（フロントの計測呼び出しに
    # 依存させると離脱・通信断・実装漏れがそのまま成果の欠損になる）。value に注文金額を
    # 入れておくと、CV数と売上の両方をこのイベント 1 種類から集計できる。
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


@router.post("/{order_id}/reorder", response_model=CartMergeResultOut)
def reorder(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartMergeResultOut:
    """過去の注文明細をカートへ再投入する（もう一度買う）。

    購入できない明細はエラーにせずスキップし、理由とともに返す。
    キャンセル済みの注文からの再注文も許可する。

    在庫の引き当て判定は services/cart.py の merge_lines が持つ（ゲストカートの
    ログイン時マージと同じ判定を使う。売り越しに直結する計算を 2 か所に置かない）。
    """
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # 商品名は注文時点のスナップショットを渡す（商品が消えていても名前を出せる）。
    lines = [
        cart_service.CartLineRequest(
            product_id=item.product_id,
            quantity=item.quantity,
            fallback_name=item.product_name,
        )
        for item in order.items
    ]

    try:
        added, skipped = cart_service.merge_lines(db, current_user.id, lines)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return CartMergeResultOut(cart=_get_cart(db, current_user), added=added, skipped=skipped)


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
