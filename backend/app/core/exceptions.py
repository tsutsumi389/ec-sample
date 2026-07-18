"""ドメイン例外。

Service 層は HTTP に依存せず、業務ルール違反をこれらの例外で表現する。
FastAPI の HTTPException を Service/Repository に持ち込まないことで、層の独立性を保つ。
HTTP ステータスへの変換は main.py に登録した単一のハンドラで一元的に行う
（従来 router ごとに散っていた HTTPException を集約する）。

status_code / default_detail は従来 router が返していた値をそのまま踏襲しており、
API のレスポンス（ステータス・detail 文言）は変更しない。
"""


class AppError(Exception):
    """業務ルール違反を表すドメイン例外の基底。

    status_code と detail を持ち、ハンドラで JSON レスポンスへ変換される。
    """

    status_code: int = 400
    default_detail: str = "Bad request"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail if detail is not None else self.default_detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    """対象リソースが存在しない（→ 404）。"""

    status_code = 404
    default_detail = "Not found"


class ConflictError(AppError):
    """一意制約や重複など、状態の衝突（→ 400）。

    従来コードが重複を 400 で返していたため 400 を踏襲する（409 にはしない）。
    """

    status_code = 400
    default_detail = "Conflict"


class UnauthorizedError(AppError):
    """認証に失敗した（→ 401）。ログイン時の資格情報不一致などに使う。"""

    status_code = 401
    default_detail = "Unauthorized"


class ForbiddenError(AppError):
    """権限・前提条件を満たさず操作が許可されない（→ 403）。"""

    status_code = 403
    default_detail = "Forbidden"


class BusinessRuleError(AppError):
    """在庫不足・購入不可・不正な状態遷移などの業務ルール違反（→ 400）。"""

    status_code = 400
    default_detail = "Invalid request"
