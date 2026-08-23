"""配送先文字列の組み立てと、表示用の伏字化。

同居させるのは**伏字の正規表現が組み立ての出力形に依存している**ため。片方だけ直しても
例外は出ず、電話番号がそのまま外へ出るだけなので、離して置くと壊れたことに気づけない。

DB を触らない純関数だけを置く（Address の行を引くのは呼び出し側の仕事）。
"""

import re

from app.models import Address

# 「TEL: 03-1234-5678」の行を潰す。format_shipping_address が組む形（TEL: の後ろは
# 数字・ハイフン・括弧・空白・+ だけ）に合わせてある。
_TEL_RE = re.compile(r"TEL:\s*[\d+\-() ]+")


def format_shipping_address(address: Address) -> str:
    """Order.shipping_address に保存する形。

    下見（MCP の preview_checkout）と確定（create_order）が同じ文字列を作るための唯一の源。
    ここが 2 か所に割れると、確認トークンの address_hash が一致せず注文が通らなくなる。
    """
    return (
        f"{address.recipient_name}\n"
        f"〒{address.postal_code} {address.prefecture}{address.city}{address.address_line}\n"
        f"TEL: {address.phone}"
    )


def mask_shipping_address(text: str) -> str:
    """配送先文字列から電話番号を伏せる。番地は残す。

    MCP の戻り値は LLM の会話ログ（＝モデル提供側のログ）に残る。「どこへ送るか」の確認には
    番地まで要るが、**電話番号は注文内容の確認に一切要らない**ので落とす。
    伏せるのは表示だけで、保存される文字列と確認トークンの address_hash は元の全文で
    計算する（伏字を指紋に混ぜると照合が壊れる）。
    """
    return _TEL_RE.sub("TEL: ***", text)
