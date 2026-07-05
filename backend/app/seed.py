from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Category, Coupon, Order, OrderItem, Product, Review, User


def _product_image(slug: str) -> str:
    """frontend/public/products/ 配下のブランド統一SVGイラストを返す。

    フロントと同一オリジンで配信されるため相対パスで指定する。
    外部ストック写真（picsum 等）はトーン不統一のため使用しない。
    """
    return f"/products/{slug}.svg"


SEED_PRODUCTS = [
    {
        "name": "ワイヤレスイヤホン",
        "slug": "wireless-earphone",
        "description": "周囲の騒音をしっかり抑えるノイズキャンセリング機能を搭載した、高音質ワイヤレスイヤホン。ケース込みで最大24時間再生でき、通勤や在宅ワークでも一日中バッテリーを気にせず使えます。IPX4の生活防水に対応し、片耳わずか4.5gの軽さで長時間つけても疲れにくい設計です。",
        "price": 8980,
        "stock": 45,
    },
    {
        "name": "コーヒーメーカー",
        "slug": "coffee-maker",
        "description": "豆から挽けるミル内蔵の全自動ドリップ式コーヒーメーカー。挽き目と濃さを好みに合わせて調整でき、朝のタイマー予約にも対応します。ガラスサーバーは最大5杯分。ミル部分は取り外して丸洗いできるので、毎日のお手入れも簡単です。挽きたての香りを、自宅で手軽に楽しめます。",
        "price": 12800,
        "stock": 20,
    },
    {"name": "電気ケトル", "slug": "electric-kettle", "description": "1Lの大容量で素早く沸騰する電気ケトルです。", "price": 3480, "stock": 60},
    {"name": "モバイルバッテリー", "slug": "mobile-battery", "description": "大容量20000mAhでスマホを約5回充電可能。", "price": 2980, "stock": 80},
    {"name": "折りたたみ傘", "slug": "folding-umbrella", "description": "軽量で持ち運びやすい自動開閉式の折りたたみ傘。", "price": 1980, "stock": 100},
    {"name": "デスクライト", "slug": "desk-light", "description": "目に優しいLEDデスクライト。調光・調色機能付き。", "price": 4500, "stock": 35},
    {"name": "ヨガマット", "slug": "yoga-mat", "description": "滑りにくい厚手のヨガマット。収納バッグ付き。", "price": 2500, "stock": 50},
    {"name": "ステンレスボトル", "slug": "stainless-bottle", "description": "保温保冷に優れた真空断熱ステンレスボトル 500ml。", "price": 1500, "stock": 90},
    {"name": "ブルートゥーススピーカー", "slug": "bluetooth-speaker", "description": "防水仕様のポータブルBluetoothスピーカー。", "price": 6980, "stock": 30},
    {"name": "腕時計", "slug": "wrist-watch", "description": "シンプルで上品なデザインのクオーツ腕時計。", "price": 15800, "stock": 0},
]

SEED_CATEGORIES = [
    {"name": "キッチン家電", "slug": "kitchen-appliances"},
    {"name": "生活家電", "slug": "home-appliances"},
    {"name": "日用品", "slug": "daily-goods"},
    {"name": "アウトドア", "slug": "outdoor"},
    {"name": "ファッション小物", "slug": "fashion-accessories"},
]

# 各商品スラッグに割り当てるカテゴリスラッグ
PRODUCT_CATEGORY_SLUG = {
    "wireless-earphone": "home-appliances",
    "coffee-maker": "kitchen-appliances",
    "electric-kettle": "kitchen-appliances",
    "mobile-battery": "home-appliances",
    "folding-umbrella": "daily-goods",
    "desk-light": "home-appliances",
    "yoga-mat": "outdoor",
    "stainless-bottle": "daily-goods",
    "bluetooth-speaker": "home-appliances",
    "wrist-watch": "fashion-accessories",
}

SEED_COUPONS = [
    {
        "code": "WELCOME10",
        "discount_type": "percent",
        "discount_value": 10,
        "min_order_amount": 0,
        "is_active": True,
        "expires_at": None,
    },
    {
        "code": "SAVE500",
        "discount_type": "fixed",
        "discount_value": 500,
        "min_order_amount": 5000,
        "is_active": True,
        "expires_at": None,
    },
]


def seed_data(db: Session) -> None:
    """Insert initial seed data if the users table is empty."""
    if db.query(User).first() is not None:
        return

    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("admin123"),
        name="管理者",
        role="admin",
    )
    user = User(
        email="user@example.com",
        hashed_password=hash_password("user123"),
        name="山田太郎",
        role="user",
    )
    db.add_all([admin, user])
    db.flush()

    categories_by_slug: dict[str, Category] = {}
    for cat in SEED_CATEGORIES:
        category = Category(name=cat["name"], slug=cat["slug"])
        db.add(category)
        categories_by_slug[cat["slug"]] = category
    db.flush()

    products_by_slug: dict[str, Product] = {}
    for item in SEED_PRODUCTS:
        category = categories_by_slug.get(PRODUCT_CATEGORY_SLUG.get(item["slug"], ""))
        product = Product(
            name=item["name"],
            description=item["description"],
            price=item["price"],
            stock=item["stock"],
            image_url=_product_image(item["slug"]),
            is_active=True,
            category=category,
        )
        db.add(product)
        products_by_slug[item["slug"]] = product
    db.flush()

    for coupon in SEED_COUPONS:
        db.add(Coupon(**coupon))

    # 動作確認用: user@example.com の購入実績とレビューを投入する。
    # レビュー投稿の資格（cancelled 以外の注文で購入済み）を満たすよう、
    # 実際の Order/OrderItem も合わせて作成する。
    earphone = products_by_slug["wireless-earphone"]
    bottle = products_by_slug["stainless-bottle"]

    earphone.stock -= 1
    bottle.stock -= 1

    sample_order = Order(
        user_id=user.id,
        total_amount=earphone.price + bottle.price,
        discount_amount=0,
        coupon_code=None,
        status="delivered",
        shipping_address="東京都渋谷区1-2-3 サンプルビル101\nTEL: 03-1234-5678",
        items=[
            OrderItem(
                product_id=earphone.id,
                product_name=earphone.name,
                price=earphone.price,
                quantity=1,
            ),
            OrderItem(
                product_id=bottle.id,
                product_name=bottle.name,
                price=bottle.price,
                quantity=1,
            ),
        ],
    )
    db.add(sample_order)

    db.add_all(
        [
            Review(
                product_id=earphone.id,
                user_id=user.id,
                rating=5,
                comment="音質が良く、ノイズキャンセリングも効いていて満足しています。",
            ),
            Review(
                product_id=bottle.id,
                user_id=user.id,
                rating=4,
                comment="保温性が高くて便利です。もう少し軽いと嬉しい。",
            ),
        ]
    )

    db.commit()
