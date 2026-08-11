"""preview_checkout が発行し、place_order だけが受け取る確認トークン。

DB を持たない（テーブルを増やさない）ステートレスな署名トークン。「ユーザーが確認した
買い物の姿」を署名で綴じ込み、place_order は現在の DB から同じ姿を組み直して、一致した
ときだけ注文へ進む。

このモジュールは app.* を一切 import しない（鍵も現在時刻も引数で受け取る）。理由は 2 つ:
  - app.auth は import した瞬間に SECRET_KEY を要求する（fail closed）。backend/tests/ の
    「DB 不要の純ロジックテスト」を環境変数なしで走らせるため、依存を切っておく。
  - 鍵の出どころを呼び出し側の 1 か所に閉じ込め、ここには「鍵で署名する」以外の知識を
    置かない。

**トークンに書かれた金額は決して請求額にならない。** 請求額は従来どおり create_order が
effective_price から計算する。トークンの金額は「ユーザーが見た額と今の額が一致しているか」を
突き合わせる照合値であって、指示値ではない。ここを取り違えると防御が丸ごと崩壊する。
"""

import base64
import binascii
import hashlib
import hmac
import secrets
from collections.abc import Callable, Sequence
from dataclasses import dataclass

# JWT と同じ SECRET_KEY を材料にするので、(1) この用途専用の鍵を派生させ、(2) 署名対象の
# 先頭にも用途文字列を置く。片方でも混同は防げるが、両方あれば「派生を外した」
# 「プレフィックスを消した」のどちらの事故でも一方が残る。
_KEY_INFO = b"hibino-mcp/confirm-token/v1/key"
_MSG_PREFIX = "hibino-mcp/confirm-token/v1"
# JWT（aaa.bbb.ccc）と一目で見分かる形にする。ログや会話に現れたときに「これは
# セッショントークンではない」と分かること自体が防御になる（decode_access_token に
# 渡しても、Bearer らしき文字列を保存するクライアントに拾われても、認証には使えない）。
_TOKEN_PREFIX = "hbc1_"

# 有効期限。3 分だと 5 明細のカートを人間が読んで納得するのに足りず、「期限切れ →
# やり直し → また期限切れ」で安全弁が邪魔者になる。30 分は長すぎる。値ずれは指紋が
# 捕まえるので、TTL の実害は「会話ログに残った有効なトークンが後続ターンで叩かれる窓」の
# 長さそのもの。
TTL_SECONDS = 10 * 60
# 単一プロセスなので本来ゼロでよい。時計の巻き戻りを検出するためだけの許容幅。
_MAX_CLOCK_SKEW_SECONDS = 60
# 壊れた入力に base64 デコードの時間を使わないための足切り。**発行できるトークンの最大長
# より十分大きく取ること。** ここを詰めすぎると、自由入力の住所が長い注文だけ issue() は
# 成功して verify() が「形式不正」で弾くという、再現条件の分かりにくい壊れ方をする
# （和文 1 文字は UTF-8 で 3 バイト、それを base64 で 4/3 倍し、さらに本体ごと base64 で
# 4/3 倍するので、住所の文字数はおよそ 5.3 倍になってトークンに効く）。
# preview_checkout 側の shipping_address は 200 文字に制限してあり、実際に出るトークンは
# 最悪でも 2.3KB 程度。
_MAX_TOKEN_CHARS = 4096
_FIELDS = ("u", "h", "t", "a", "s", "d", "c", "o", "i", "e", "n")


class ConfirmTokenError(Exception):
    """確認トークンが使えない理由。code で分岐し、message はそのまま LLM に返す。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AddressRef:
    """配送先の指定。登録済みなら address_id、自由入力なら text。

    どちらか一方だけが埋まる（両立も両欠も改竄の疑いとして弾く）。登録済みの経路では
    整数しかトークンに載らないので、PII がトークンへ漏れない。
    """

    address_id: int  # 0 = 自由入力
    text: str | None = None  # address_id == 0 のときだけ非 None


@dataclass(frozen=True)
class CartState:
    """トークンに綴じ込む「いまの買い物の姿」。DB を知らない値だけで組む。"""

    cart_hash: str
    address: AddressRef
    address_hash: str  # 実際に保存される住所文字列の指紋
    coupon_code: str | None
    total_amount: int  # 割引後。create_order が Order.total_amount に入れる額
    last_order_id: int


@dataclass(frozen=True)
class ConfirmClaims:
    user_id: int
    state: CartState
    issued_at: int
    expires_at: int
    nonce: str


# ---- 文言（そのまま LLM に見せる。理由 → 次に呼ぶツール名の順） ----------------------
#
# ツールのエラーは SDK が "Error executing tool <name>: " を前置するので、体言止めや
# 「〜してください」始まりにせず、前置きされても読める文にしてある。

_MSG_MALFORMED = (
    "確認トークンが無効です。preview_checkout をもう一度呼び、返ってきた confirm_token を "
    "そのまま place_order に渡してください（トークンを編集・再構成しないでください）。"
)
_MSG_EXPIRED = (
    "確認トークンの有効期限が切れました（発行から10分）。preview_checkout をもう一度呼んで "
    "新しい confirm_token を取得し、内容をユーザーに確認してから place_order を呼んでください。"
)
_MSG_ALREADY_ORDERED = (
    "この確認トークンは使用済みです（または、その後に別の注文が確定しています）。"
    "list_orders で直近の注文を確認してください。同じ買い物を二重に注文しないでください。"
    "本当にもう一度買う場合は preview_checkout からやり直してください。"
)
_MSG_CART_CHANGED = (
    "カートの内容が preview_checkout の時点から変わっています（商品・数量・価格のいずれか）。"
    "get_cart で現在の内容を確認し、preview_checkout をやり直して、新しい金額をユーザーに "
    "提示してから place_order を呼んでください。"
)
_MSG_TOTAL_CHANGED = (
    "合計金額が preview_checkout の時点から変わっています（クーポンの適用条件が変わった "
    "可能性があります）。preview_checkout をやり直し、新しい合計をユーザーに提示してください。"
)
_MSG_ADDRESS_CHANGED = (
    "配送先が preview_checkout の時点から変わっています（削除・編集された可能性があります）。"
    "list_addresses で選び直し、preview_checkout をやり直してください。"
)


# ---- 鍵と指紋 -----------------------------------------------------------------


def signing_key(secret_key: str) -> bytes:
    """SECRET_KEY から確認トークン専用の鍵を導出する（HMAC を PRF として使う）。

    環境変数を 2 本目に増やさないのは、fail closed の検査・make secret の生成・compose の
    受け渡し・.env の管理・ローテーション手順がすべて二重になり、そして 2 本目を忘れた
    ときに「無ければ SECRET_KEY にフォールバック」と書きたくなるため（CLAUDE.md が禁じて
    いる既定値そのもの）。分離は運用ではなく暗号で取る——派生鍵から SECRET_KEY は復元
    できないので、JWT の署名鍵と計算上独立になる。
    """
    return hmac.new(secret_key.encode("utf-8"), _KEY_INFO, hashlib.sha256).digest()


def cart_fingerprint(lines: Sequence[tuple[int, int, int, int]]) -> str:
    """(cart_item_id, product_id, quantity, unit_price) の並びから指紋を作る。

    unit_price は effective_price（カートを組んだ既存関数の値をそのまま渡す。ここで価格を
    計算し直さないこと）。単価を含めるのは、下見の時点でセール中だった商品がセール終了で
    値上がりしたあと、古いトークンで「ユーザーが見たことのない金額」の注文が確定する穴を
    塞ぐため。単価を明細ごとに入れるのは、合計だけだと「A を 1 個増やし B を 1 個減らす」
    組み替えを通してしまうため。cart_item_id を含めるのは、注文確定で CartItem 行が消える
    ので、同じ商品を同じ数だけ入れ直しても id が変わって一致しないようにするため
    （last_order_id と併せた多重防御）。

    在庫と status は入れない。create_order が行ロック下で必ず再検査する（そちらが唯一の
    源）。ここに入れると、他人が 1 個買っただけでユーザーに無関係なやり直しを強いる。
    """
    canonical = ";".join(f"{i}:{p}:{q}:{u}" for i, p, q, u in sorted(lines))
    return hashlib.sha256(f"{_MSG_PREFIX}/cart\n{canonical}".encode()).hexdigest()


def address_fingerprint(text: str) -> str:
    """実際に Order.shipping_address へ保存される文字列の指紋。

    下見のあとに登録住所が編集・削除された場合を捕まえる。住所が引けなかったときは
    空文字の指紋になり、照合で必ず落ちる（＝トークンは使えない）。
    """
    return hashlib.sha256(f"{_MSG_PREFIX}/address\n{text}".encode()).hexdigest()


# ---- 正準化 -------------------------------------------------------------------


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _opt(value: str | None) -> str:
    return _b64e(value.encode("utf-8")) if value else "-"


def _canonical(user_id: int, s: CartState, iat: int, exp: int, nonce: str) -> str:
    """署名対象の正準文字列。

    全フィールドが 数字 / 16進 / base64url / '-' のいずれかなので、区切り文字（| と =）が
    値の中に現れることはない ＝ エスケープが要らない。エスケープ漏れという脆弱性の種を、
    そもそも作らない形にしてある（JSON を正準化する方式にしないのはこれが理由）。
    フィールド数は固定で、_parse 側も本数を数えて弾く。
    """
    return (
        f"{_MSG_PREFIX}"
        f"|u={user_id}|h={s.cart_hash}|t={s.total_amount}"
        f"|a={s.address.address_id}|s={_opt(s.address.text)}|d={s.address_hash}"
        f"|c={_opt(s.coupon_code)}|o={s.last_order_id}"
        f"|i={iat}|e={exp}|n={nonce}"
    )


def _parse(text: str) -> ConfirmClaims:
    prefix, *fields = text.split("|")
    if prefix != _MSG_PREFIX or len(fields) != len(_FIELDS):
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    kv: dict[str, str] = {}
    for field in fields:
        key, sep, value = field.partition("=")
        if not sep or key in kv:
            raise ConfirmTokenError("malformed", _MSG_MALFORMED)
        kv[key] = value
    if set(kv) != set(_FIELDS):
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    try:
        address_id = int(kv["a"])
        text_value = None if kv["s"] == "-" else _b64d(kv["s"]).decode("utf-8")
        coupon = None if kv["c"] == "-" else _b64d(kv["c"]).decode("utf-8")
        claims = ConfirmClaims(
            user_id=int(kv["u"]),
            state=CartState(
                cart_hash=kv["h"],
                address=AddressRef(address_id=address_id, text=text_value),
                address_hash=kv["d"],
                coupon_code=coupon,
                total_amount=int(kv["t"]),
                last_order_id=int(kv["o"]),
            ),
            issued_at=int(kv["i"]),
            expires_at=int(kv["e"]),
            nonce=kv["n"],
        )
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise ConfirmTokenError("malformed", _MSG_MALFORMED) from exc
    # 登録済み住所と自由入力はどちらか一方。両立・両欠は改竄の疑い。
    if (address_id == 0) != (text_value is not None):
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    return claims


# ---- 発行 / 検証 ---------------------------------------------------------------


def issue(key: bytes, *, user_id: int, state: CartState, now: int) -> str:
    """確認トークンを発行する。preview_checkout からのみ呼ぶ。

    nonce は 16 バイト乱数。トークンを一意にすると同時に、サーバー側のログに残す監査 ID に
    なる（トークン本体はログに出さない）。

    有効期限は返さない。呼び出し側が出しているのは絶対時刻ではなく残り秒数
    （TTL_SECONDS）で、両方を返すと絶対時刻と秒数が混ざる余地が残る。
    """
    nonce = secrets.token_hex(16)
    body = _canonical(user_id, state, now, now + TTL_SECONDS, nonce)
    mac = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    return f"{_TOKEN_PREFIX}{_b64e(body.encode('utf-8'))}.{_b64e(mac)}"


def verify(
    key: bytes,
    token: str,
    *,
    user_id: int,
    now: int,
    load_current: Callable[[AddressRef, str | None], CartState],
) -> ConfirmClaims:
    """トークンを検証して claims を返す。使えないときは ConfirmTokenError。

    load_current は (AddressRef, coupon_code) を受け取り、現在の DB から CartState を組んで
    返すコールバック（= preview_checkout が使うのと同じ関数を渡す）。

    「開くだけ」の関数を公開せず、現在値との突き合わせまでを 1 つの関数に閉じてあるのは、
    呼び出し側が照合を書き忘れる余地を残さないため。署名が通っただけのトークンは「昔
    ユーザーが確認した何か」でしかなく、いま注文してよい根拠にはならない。

    残存リスク: ステートレスなので暗号的に厳密なワンタイム性は無い。ただし last_order_id に
    より注文が 1 本でも確定すればすべての未使用トークンが死に、cart_item_id により入れ直した
    カートとも一致しない。完全なワンタイム化には使用済み nonce の表が要り、それは「テーブルを
    増やさない」という設計判断と衝突する。
    """
    if not token.startswith(_TOKEN_PREFIX) or len(token) > _MAX_TOKEN_CHARS:
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    body_b64, sep, mac_b64 = token[len(_TOKEN_PREFIX) :].partition(".")
    if not sep:
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    try:
        body = _b64d(body_b64).decode("utf-8")
        given_mac = _b64d(mac_b64)
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise ConfirmTokenError("malformed", _MSG_MALFORMED) from exc

    expected_mac = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    # タイミング攻撃対策。長さが違っても compare_digest は False を返す。
    # 文面は形式不正と同じにする（偽造の当たり判定を教えない）。
    if not hmac.compare_digest(given_mac, expected_mac):
        raise ConfirmTokenError("bad_signature", _MSG_MALFORMED)

    claims = _parse(body)

    if now > claims.expires_at:
        raise ConfirmTokenError("expired", _MSG_EXPIRED)
    if now < claims.issued_at - _MAX_CLOCK_SKEW_SECONDS:
        # 時計が巻き戻った（or 未来の iat を持つ偽造）。
        raise ConfirmTokenError("malformed", _MSG_MALFORMED)
    if claims.user_id != user_id:
        # 署名は通ったが持ち主が違う。文面は形式不正と同じ。
        raise ConfirmTokenError("not_yours", _MSG_MALFORMED)

    # ここから先は DB を触る。署名も期限も持ち主も通ったトークンにだけ現在値を組ませる。
    current = load_current(claims.state.address, claims.state.coupon_code)

    if claims.state.last_order_id != current.last_order_id:
        raise ConfirmTokenError("already_ordered", _MSG_ALREADY_ORDERED)
    if not hmac.compare_digest(claims.state.cart_hash, current.cart_hash):
        raise ConfirmTokenError("cart_changed", _MSG_CART_CHANGED)
    if claims.state.total_amount != current.total_amount:
        raise ConfirmTokenError("total_changed", _MSG_TOTAL_CHANGED)
    if claims.state.coupon_code != current.coupon_code:
        # 合計だけ見ていると、**割引額が 0 のクーポン**が有効→無効に変わった場合を素通し
        # する（total が動かないため）。そのまま進むと place_order が失効したコードを
        # create_order に渡し、下見をやり直す案内の無い生の 400 になる。
        raise ConfirmTokenError("coupon_changed", _MSG_TOTAL_CHANGED)
    if not hmac.compare_digest(claims.state.address_hash, current.address_hash):
        raise ConfirmTokenError("address_changed", _MSG_ADDRESS_CHANGED)

    return claims
