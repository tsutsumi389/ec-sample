from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import EMBED_DIM
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # パスワード最終変更時刻。これより前に発行された JWT（iat が古いもの）は失効させる。
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    cart_items: Mapped[list["CartItem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    products: Mapped[list["Product"]] = relationship(back_populates="category")


# 商品の状態機械。可視性・購入可否はすべてこの単一の状態から導出する
# （旧 is_active フラグは廃止し archived に統合）。
PRODUCT_STATUSES = (
    "draft",  # 下書き（未公開）。一覧・商品ページとも非表示、購入不可
    "coming_soon",  # 近日発売。表示するが購入不可
    "on_sale",  # 販売中。表示・購入可（在庫があれば）
    "suspended",  # 一時停止。在庫があっても表示のみで購入不可
    "discontinued",  # 販売終了。一覧からは隠すが商品ページ・履歴は残す
    "archived",  # 論理削除相当。一覧・商品ページとも非表示
)

# 一覧（トップ・検索）に表示する状態。
LISTED_STATUSES = ("coming_soon", "on_sale", "suspended")
# 商品ページを直接開いて閲覧できる状態（一覧非表示でも URL では見られるもの）。
VIEWABLE_STATUSES = ("coming_soon", "on_sale", "suspended", "discontinued")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # 商品コード（SKU）。在庫・注文管理の実務標準。任意だが設定時は一意。
    sku: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    # セール価格。設定時は price を定価（打ち消し表示）、sale_price を実売価格として扱う。
    sale_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 販売状態。可視性・購入可否の唯一の源。新規作成時は draft（誤公開防止）。
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    cart_items: Mapped[list["CartItem"]] = relationship(back_populates="product")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order, ProductImage.id",
    )

    @property
    def effective_price(self) -> int:
        """実売価格。セール価格があればそれを、なければ定価を返す。

        カート小計・注文金額・OrderItem スナップショットはすべてこの値を使う。
        """
        return self.sale_price if self.sale_price is not None else self.price

    @property
    def is_listed(self) -> bool:
        """一覧（トップ・検索）に表示してよいか。"""
        return self.status in LISTED_STATUSES

    @property
    def is_viewable(self) -> bool:
        """商品ページを直接開いて閲覧してよいか。"""
        return self.status in VIEWABLE_STATUSES

    @property
    def purchasable(self) -> bool:
        """購入可能か。販売中(on_sale)かつ在庫ありのときだけ True。"""
        return self.status == "on_sale" and self.stock > 0


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    image_url: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship(back_populates="images")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship(back_populates="reviews")
    user: Mapped["User"] = relationship()


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()
    product: Mapped["Product"] = relationship()


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String, nullable=False)
    postal_code: Mapped[str] = mapped_column(String, nullable=False)
    prefecture: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str] = mapped_column(String, nullable=False)
    address_line: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()


class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    discount_type: Mapped[str] = mapped_column(String, nullable=False)
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    user: Mapped["User"] = relationship(back_populates="cart_items")
    product: Mapped["Product"] = relationship(back_populates="cart_items")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    shipping_address: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


# ---------- レコメンド（セマンティックID / 埋め込み / LLM生成キャッシュ）----------
#
# 以下 4 テーブルはレコメンド機能専用。既存テーブルには一切カラムを足さず、
# 商品埋め込みやユーザ推薦結果はここに分離して持つ（マイグレーションツール未導入のため、
# 既存テーブルへの追加はできず新規テーブルの追加のみ許容される運用に合わせる）。


class ProductEmbedding(Base):
    """商品テキストの埋め込みベクトルとセマンティックID。

    product_id を主キー兼 FK にして 1 商品 1 行で持つ。source_hash / embed_model が
    現在の商品テキスト・モデルと一致していれば再埋め込みをスキップする差分同期に使う。
    """

    __tablename__ = "product_embeddings"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), primary_key=True
    )
    # 埋め込みベクトル本体（pgvector）。次元は EMBED_DIM に固定。
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    # 残差量子化で割り当てた "a-b-c" 形式のセマンティックID（衝突時はサフィックス付き）。
    semantic_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    # semantic_id を割り当てたコードブックの世代（SemanticIdCodebook.generation）。
    codebook_generation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 埋め込み元テキストの sha256。商品編集で本文が変われば不一致になり再埋め込みされる。
    source_hash: Mapped[str] = mapped_column(String, nullable=False)
    # 生成時に使った埋め込みモデル名。モデル差し替え時の再生成判定に使う。
    embed_model: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped["Product"] = relationship()


class SemanticIdCodebook(Base):
    """残差量子化のセントロイド（コードブック）を世代管理する。

    再構築のたびに generation をインクリメントして新しい行を追加する。
    centroids は 3 階層分のセントロイド配列を JSON で保持する。
    """

    __tablename__ = "semantic_id_codebooks"

    generation: Mapped[int] = mapped_column(Integer, primary_key=True)
    # [階層0のセントロイド配列, 階層1..., 階層2...] の 3 要素。各要素は K×EMBED_DIM。
    centroids: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserRecommendation(Base):
    """LLM が生成したユーザ別のおすすめ商品キャッシュ（rank 順に返す）。

    生成のたびに当該ユーザの行を丸ごと入れ替える。reason は店員ペルソナの一言。
    """

    __tablename__ = "user_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship()


class RecommendationState(Base):
    """ユーザ別のレコメンド生成状態。多重起動防止とキャッシュ陳腐化判定に使う。

    profile_hash が現在の行動ハッシュと一致し status=ready ならキャッシュを返せる。
    status=generating かつ generated_at が新しければ二重生成をスキップする。
    """

    __tablename__ = "recommendation_states"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # 生成時点のユーザ行動（購入・カート・お気に入り・高評価）から作ったハッシュ。
    profile_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # generating / ready / failed のいずれか。
    status: Mapped[str] = mapped_column(String, nullable=False, default="generating")
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProductView(Base):
    """ログインユーザーの商品閲覧履歴。パーソナライズのシグナル用。

    1 ユーザー × 1 商品で 1 行だけ持ち、再閲覧時は viewed_at を更新して
    view_count をインクリメントする（閲覧のたびに行を増やすとテーブルが
    肥大化するため。購入・お気に入りと同様に「関心のある商品」を表す軽い信号）。
    """

    __tablename__ = "product_views"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_product_view_user_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    # 同一商品を何度見たか。再閲覧のたびに +1 して関心の強さの目安にする。
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 最終閲覧時刻。時間減衰（新しい閲覧ほど重い）の基準に使う。
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()
    product: Mapped["Product"] = relationship()


# ---------- AIショッピングアシスタント（チャット会話）----------
#
# レコメンドとは別の同期チャット機能。会話単位でメッセージを永続化し、未ログインでも
# 端末の localStorage に UUID を保持して継続できるようにする（下記 AssistantConversation
# 参照）。既存テーブルには一切カラムを足さず新規テーブルのみ追加する運用に合わせる。


class AssistantConversation(Base):
    """チャットアシスタントの会話。1 会話 = 複数メッセージ。

    id は推測困難な UUID（文字列 PK）。未ログインでもフロントの localStorage に UUID を
    保持することでパネル再オープン時に会話を継続できる。ゲスト会話は user_id が NULL で、
    UUID を知っていること自体が認可になる（サンプルアプリとして許容。routers 参照）。
    ゲスト会話中にログインした場合は以降のリクエストで user_id を紐付ける。
    """

    __tablename__ = "assistant_conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # ログインユーザーの会話なら本人ID。ゲスト会話は NULL。
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["AssistantMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AssistantMessage.id",
    )


class AssistantMessage(Base):
    """会話内の 1 メッセージ（user / assistant）。

    assistant 行は提案商品IDの配列（product_ids）と生成元（source: llm / fallback）を
    保持する。product_ids は履歴復元時にカードを引き直すためのもので、復元時に
    LISTED_STATUSES を再確認して非公開化された商品は落とす。
    """

    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("assistant_conversations.id"), nullable=False, index=True
    )
    # "user" | "assistant"
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # assistant メッセージが提案した商品IDの配列（カード再描画用）。user 行では空配列。
    product_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # "llm" | "fallback"（assistant 行のみ。user 行では NULL）。
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    conversation: Mapped["AssistantConversation"] = relationship(
        back_populates="messages"
    )


# ---------- 商品Q&A（購入前質問へのAI回答）----------
#
# 商品ページで購入検討者の質問に、その商品の説明文とレビューだけを根拠に AI が即答し、
# 公開・蓄積する機能。回答は生成時点のスナップショット（OrderItem と同じ思想で後から
# 再生成しない）。可視性・購入可否は Product.status に従い、既存テーブルには一切カラムを
# 足さず新規テーブルのみ追加する運用に合わせる。


class ProductQuestion(Base):
    """商品ページの購入前Q&A。1 質問 = 1 AI回答で 1 行持つ。

    質問できるのはログインユーザーのみ（レビューと同じ権限モデル）だが、蓄積された
    Q&A は誰でも閲覧できる（社会的証明）。source は生成元（llm / fallback）、answerable は
    根拠から答えられたか（UI で「情報不足」表示に使う）。id は推測困難な UUID 文字列。
    """

    __tablename__ = "product_questions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    # "llm" | "fallback"（Ollama 失敗時は fallback の定型文を保存する）。
    source: Mapped[str] = mapped_column(String, nullable=False)
    # AI が商品情報・レビューを根拠に答えられたか。False は「情報不足」を表す。
    answerable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship()
    user: Mapped["User"] = relationship()


# ---------- A/Bテスト（実験）と行動イベントログ ----------
#
# 実験の割り当ては DB に持たず、visitor_id と実験の salt から決定論的ハッシュで毎回
# 計算する（services/experiment.py）。ここに置くのは「何を実験しているか（定義）」と
# 「誰にどの variant を見せたか（曝露）」と「誰が何をしたか（イベント）」の3種類だけ。
#
# 成果は実験専用テーブルではなく汎用の analytics_events に集約し、分析時に曝露と
# JOIN して variant 別に切り出す。こうすると実験を作る前から貯まったログを後から
# 任意の指標で振り返れる（実験専用の計測にすると、指標を思いついた時点より前の
# データが存在しないという致命的な制約を抱えるため）。


# 実験の状態機械。Product.status と同じく、可視性・稼働可否はこの単一の状態から導出する。
EXPERIMENT_STATUSES = (
    "draft",  # 下書き。誰にも配信されない（設定変更が自由にできる状態）
    "running",  # 実施中。割り当てと曝露記録が行われる唯一の状態
    "paused",  # 一時停止。新規の割り当てを止める（既存データは保持）
    "completed",  # 終了。結果は参照できるが配信はしない
)

# 実際に配信対象となる状態。実験は物理削除せず completed にする（結果を失わないため）。
ACTIVE_EXPERIMENT_STATUSES = ("running",)


class Experiment(Base):
    """A/Bテストの実験定義。1 実験 = 複数 variant。

    key はコード側（useVariant('...')）から参照する識別子で、後から変えない。
    salt は割り当てハッシュに混ぜる文字列。実験ごとに異なる salt を持たせることで、
    「実験Aで control だった人が実験Bでも control になる」というキャリーオーバー相関を
    防ぐ。同じ実験をやり直したいときも salt を変えれば再抽選できる。
    """

    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 配信可否の唯一の源。個別の真偽フラグは増やさない。新規作成時は draft（誤配信防止）。
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    salt: Mapped[str] = mapped_column(String, nullable=False)
    # 実験対象に含める訪問者の割合（0-100）。残りは実験対象外として variant を返さない。
    # 小さく始めて（例: 10%）問題が無ければ広げる、という安全な展開に使う。
    traffic_allocation: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    # 主要指標にするイベント名（analytics_events.name）。結果画面の既定の集計対象。
    primary_metric: Mapped[str] = mapped_column(String, nullable=False, default="purchase")
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    variants: Mapped[list["ExperimentVariant"]] = relationship(
        back_populates="experiment",
        cascade="all, delete-orphan",
        order_by="ExperimentVariant.id",
    )

    @property
    def is_active(self) -> bool:
        """いま新規の割り当て・曝露記録を行ってよいか。"""
        return self.status in ACTIVE_EXPERIMENT_STATUSES


class ExperimentVariant(Base):
    """実験の枝（control / treatment ...）。

    config は「その枝で使う設定値」を丸ごと持つ JSON。レイアウト実験ではカラム数や
    セクション順序、CTA の文言などをここに入れる。フロントは config を読むだけで
    済むため、枝を増やすたびにコードへ if を足す必要がなくなる。
    """

    __tablename__ = "experiment_variants"
    __table_args__ = (
        UniqueConstraint("experiment_id", "key", name="uq_experiment_variant_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # 枝の配分比率。合計が 100 である必要はなく、比率として正規化して使う。
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    # 対照群かどうか。結果画面でリフト計算の基準にする 1 枝だけ True にする。
    is_control: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    experiment: Mapped["Experiment"] = relationship(back_populates="variants")


class ExperimentExposure(Base):
    """「誰にどの variant を見せたか」の記録。1 訪問者 × 1 実験で 1 行。

    ProductView と同じく再訪でも行を増やさず、初回だけ記録する（分母を訪問者数で
    数えるため。同じ人を複数回数えると効果が薄まって見える）。

    variant_key を実験IDと別に非正規化して保持しているのが要点で、あとから weight を
    変更しても「当時どちらを見せたか」が失われない。分析は必ずこの列を使う。
    """

    __tablename__ = "experiment_exposures"
    __table_args__ = (
        UniqueConstraint(
            "experiment_id", "visitor_id", name="uq_experiment_exposure_visitor"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id"), nullable=False, index=True
    )
    variant_key: Mapped[str] = mapped_column(String, nullable=False)
    # 割り当ての単位。未ログインでも計測できるよう端末の visitor_id を使う
    # （user_id を単位にすると、カート投入前の大半を占める未ログイン行動を測れない）。
    visitor_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # 曝露時点でログインしていれば紐付ける。分析の切り口に使うだけで割り当てには使わない。
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    experiment: Mapped["Experiment"] = relationship()


class AnalyticsEvent(Base):
    """汎用の行動イベントログ。実験に紐づかない素のログとして貯める。

    name はイベント種別（page_view / click / impression / add_to_cart / purchase ...）。
    element_key は「どのUI要素か」を表す任意の識別子で、レイアウト実験では
    これを軸にクリック分布の変化を見る。value は金額やスクロール率などの数値指標。
    props には商品IDなど分析用の付随情報を入れる。
    """

    __tablename__ = "analytics_events"
    __table_args__ = (
        # 指標ごとの期間集計（結果画面の主クエリ）。
        Index("ix_analytics_events_name_occurred", "name", "occurred_at"),
        # 曝露との JOIN（訪問者 × 指標）。
        Index("ix_analytics_events_visitor_name", "visitor_id", "name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    visitor_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    # 1 回の訪問（タブを開いてから閉じるまで）の識別子。回遊の分析に使う。
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str | None] = mapped_column(String, nullable=True)
    element_key: Mapped[str | None] = mapped_column(String, nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    props: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # クライアントで発生した時刻。曝露より前のイベントを成果に数えないための基準。
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # サーバーが受け取った時刻。バッチ送信の遅延や端末時計のずれを調べる用。
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
