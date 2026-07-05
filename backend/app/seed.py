from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Product, User


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

    for item in SEED_PRODUCTS:
        db.add(
            Product(
                name=item["name"],
                description=item["description"],
                price=item["price"],
                stock=item["stock"],
                image_url=_product_image(item["slug"]),
                is_active=True,
            )
        )

    db.commit()
