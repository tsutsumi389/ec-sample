from urllib.parse import quote

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Product, User


def _placeholder_image(text: str) -> str:
    return f"https://placehold.co/400x300?text={quote(text)}"


SEED_PRODUCTS = [
    {"name": "ワイヤレスイヤホン", "description": "ノイズキャンセリング機能付きの高音質ワイヤレスイヤホンです。", "price": 8980, "stock": 45},
    {"name": "コーヒーメーカー", "description": "全自動ドリップ式コーヒーメーカー。豆から挽けるミル内蔵。", "price": 12800, "stock": 20},
    {"name": "電気ケトル", "description": "1Lの大容量で素早く沸騰する電気ケトルです。", "price": 3480, "stock": 60},
    {"name": "モバイルバッテリー", "description": "大容量20000mAhでスマホを約5回充電可能。", "price": 2980, "stock": 80},
    {"name": "折りたたみ傘", "description": "軽量で持ち運びやすい自動開閉式の折りたたみ傘。", "price": 1980, "stock": 100},
    {"name": "デスクライト", "description": "目に優しいLEDデスクライト。調光・調色機能付き。", "price": 4500, "stock": 35},
    {"name": "ヨガマット", "description": "滑りにくい厚手のヨガマット。収納バッグ付き。", "price": 2500, "stock": 50},
    {"name": "ステンレスボトル", "description": "保温保冷に優れた真空断熱ステンレスボトル 500ml。", "price": 1500, "stock": 90},
    {"name": "ブルートゥーススピーカー", "description": "防水仕様のポータブルBluetoothスピーカー。", "price": 6980, "stock": 30},
    {"name": "腕時計", "description": "シンプルで上品なデザインのクオーツ腕時計。", "price": 15800, "stock": 5},
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
                image_url=_placeholder_image(item["name"]),
                is_active=True,
            )
        )

    db.commit()
