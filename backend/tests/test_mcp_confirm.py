"""確認トークン（preview_checkout → place_order の安全弁）のユニットテスト（DB 不要）。

トークンが守っているのは「ユーザーが確認した買い物の姿と、いま確定しようとしている姿が
同じであること」の 1 点。ここが緩むと、値上がり後の金額での確定・二重注文・送り先の
すり替えがそのまま通る。境界をここで固定する。

app.auth も DB も要らない（confirm.py は鍵も現在時刻も引数で受け取る）。
"""

import hashlib
import hmac

import pytest

from app.mcp_server import confirm

KEY = confirm.signing_key("x" * 40)
NOW = 1_700_000_000
USER_ID = 7


def make_state(
    *,
    lines=((1, 10, 2, 3000),),
    address=None,
    address_text="日比野太郎\n〒150-0001 東京都渋谷区神宮前1-2-3\nTEL: 03-1234-5678",
    coupon=None,
    total=6000,
    last_order_id=41,
) -> confirm.CartState:
    """既定は「登録済みでない自由入力の住所・クーポン無し」の素直な状態。"""
    ref = address if address is not None else confirm.AddressRef(address_id=0, text=address_text)
    text = ref.text if ref.address_id == 0 else "〒150-0001 東京都渋谷区神宮前1-2-3"
    return confirm.CartState(
        cart_hash=confirm.cart_fingerprint(lines),
        address=ref,
        address_hash=confirm.address_fingerprint(text or ""),
        coupon_code=coupon,
        total_amount=total,
        last_order_id=last_order_id,
    )


def loader(state: confirm.CartState):
    """load_current の差し替え。呼ばれたことと引数を記録する。"""
    calls: list[tuple[confirm.AddressRef, str | None]] = []

    def load(address, coupon):
        calls.append((address, coupon))
        return state

    load.calls = calls  # type: ignore[attr-defined]
    return load


class TestSigningKey:
    def test_derived_key_differs_from_secret(self):
        # 派生鍵が SECRET_KEY のバイト列そのものだと、JWT の署名鍵と計算上独立にならない。
        secret = "x" * 40
        assert confirm.signing_key(secret) != secret.encode()

    def test_derivation_is_deterministic(self):
        assert confirm.signing_key("y" * 40) == confirm.signing_key("y" * 40)

    def test_different_secrets_give_different_keys(self):
        assert confirm.signing_key("a" * 40) != confirm.signing_key("b" * 40)

    def test_key_is_sha256_sized(self):
        assert len(confirm.signing_key("z" * 40)) == 32


class TestCartFingerprint:
    def test_same_lines_in_different_order_match(self):
        # DB の返す順に依存させない。
        a = confirm.cart_fingerprint([(1, 10, 2, 3000), (2, 11, 1, 500)])
        b = confirm.cart_fingerprint([(2, 11, 1, 500), (1, 10, 2, 3000)])
        assert a == b

    def test_quantity_change_breaks_match(self):
        assert confirm.cart_fingerprint([(1, 10, 2, 3000)]) != confirm.cart_fingerprint(
            [(1, 10, 3, 3000)]
        )

    def test_unit_price_change_breaks_match(self):
        # セール終了で値上がり → ユーザーが見た金額と別物。必ず作り直させる。
        assert confirm.cart_fingerprint([(1, 10, 1, 8000)]) != confirm.cart_fingerprint(
            [(1, 10, 1, 12000)]
        )

    def test_new_cart_item_id_breaks_match(self):
        # 注文確定で CartItem 行は消える。同じ商品を同じ数だけ入れ直しても id が変わる。
        assert confirm.cart_fingerprint([(1, 10, 1, 3000)]) != confirm.cart_fingerprint(
            [(9, 10, 1, 3000)]
        )

    def test_added_line_breaks_match(self):
        assert confirm.cart_fingerprint([(1, 10, 1, 3000)]) != confirm.cart_fingerprint(
            [(1, 10, 1, 3000), (2, 11, 1, 500)]
        )

    def test_removed_line_breaks_match(self):
        assert confirm.cart_fingerprint(
            [(1, 10, 1, 3000), (2, 11, 1, 500)]
        ) != confirm.cart_fingerprint([(1, 10, 1, 3000)])

    def test_swap_keeping_total_breaks_match(self):
        # A を1個増やし B を1個減らすと合計は同じ。合計だけの照合では通ってしまう組み替え。
        before = [(1, 10, 2, 1000), (2, 11, 2, 1000)]
        after = [(1, 10, 3, 1000), (2, 11, 1, 1000)]
        assert sum(q * u for _, _, q, u in before) == sum(q * u for _, _, q, u in after)
        assert confirm.cart_fingerprint(before) != confirm.cart_fingerprint(after)

    def test_empty_cart_has_stable_value(self):
        assert confirm.cart_fingerprint([]) == confirm.cart_fingerprint([])
        assert confirm.cart_fingerprint([]) != confirm.cart_fingerprint([(1, 10, 1, 1)])


class TestAddressFingerprint:
    def test_same_text_matches(self):
        assert confirm.address_fingerprint("東京都渋谷区") == confirm.address_fingerprint(
            "東京都渋谷区"
        )

    def test_whitespace_difference_breaks_match(self):
        # 保存される文字列そのものの指紋。改行の位置が変われば別物として扱う。
        assert confirm.address_fingerprint("太郎\n東京都") != confirm.address_fingerprint(
            "太郎 東京都"
        )

    def test_empty_text_has_stable_value(self):
        # 住所が引けなかった場合。値は安定するが、実在の住所とは一致しない。
        assert confirm.address_fingerprint("") == confirm.address_fingerprint("")
        assert confirm.address_fingerprint("") != confirm.address_fingerprint("東京都")


class TestIssueAndVerify:
    def test_round_trip(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        claims = confirm.verify(
            KEY, token, user_id=USER_ID, now=NOW + 1, load_current=loader(state)
        )
        assert claims.user_id == USER_ID
        assert claims.state.total_amount == state.total_amount
        assert claims.state.address.text == state.address.text

    def test_token_has_hbc1_prefix(self):
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        assert token.startswith("hbc1_")

    def test_token_is_not_jwt_shaped(self):
        # JWT（aaa.bbb.ccc）に見えないこと自体が防御。セッショントークンとして
        # 拾われる・decode_access_token に渡される事故の芽を消す。
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        assert len(token.split(".")) == 2

    def test_registered_address_token_carries_no_pii(self):
        # 登録済み住所の経路では address_id（整数）だけが載る。
        state = make_state(address=confirm.AddressRef(address_id=3))
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        assert "東京都" not in token
        claims = confirm.verify(
            KEY, token, user_id=USER_ID, now=NOW, load_current=loader(state)
        )
        assert claims.state.address == confirm.AddressRef(address_id=3, text=None)

    def test_tampered_body_rejected(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        body, _, mac = token[len("hbc1_") :].partition(".")
        broken = "hbc1_" + ("A" if body[0] != "A" else "B") + body[1:] + "." + mac
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(KEY, broken, user_id=USER_ID, now=NOW, load_current=loader(state))
        assert exc.value.code == "bad_signature"

    def test_tampered_signature_rejected(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        body, _, mac = token[len("hbc1_") :].partition(".")
        broken = "hbc1_" + body + "." + ("A" if mac[0] != "A" else "B") + mac[1:]
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(KEY, broken, user_id=USER_ID, now=NOW, load_current=loader(state))
        assert exc.value.code == "bad_signature"

    def test_wrong_key_rejected(self):
        state = make_state()
        token = confirm.issue(
            confirm.signing_key("q" * 40), user_id=USER_ID, state=state, now=NOW
        )
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(KEY, token, user_id=USER_ID, now=NOW, load_current=loader(state))
        assert exc.value.code == "bad_signature"

    def test_expired_rejected(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY,
                token,
                user_id=USER_ID,
                now=NOW + confirm.TTL_SECONDS + 1,
                load_current=loader(state),
            )
        assert exc.value.code == "expired"

    def test_expiry_boundary_is_inclusive(self):
        # 境界の 1 秒で挙動が揺れないよう固定する。
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        confirm.verify(
            KEY,
            token,
            user_id=USER_ID,
            now=NOW + confirm.TTL_SECONDS,
            load_current=loader(state),
        )

    def test_clock_rollback_rejected(self):
        # 発行時刻より大きく過去の now は、時計の巻き戻りか未来の iat を持つ偽造。
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID, now=NOW - 3600, load_current=loader(state)
            )
        assert exc.value.code == "malformed"

    def test_other_user_rejected(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID + 1, now=NOW, load_current=loader(state)
            )
        assert exc.value.code == "not_yours"

    def test_cart_changed_rejected(self):
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        changed = make_state(lines=((1, 10, 3, 3000),))
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID, now=NOW, load_current=loader(changed)
            )
        assert exc.value.code == "cart_changed"

    def test_total_changed_rejected(self):
        # カートは同じで合計だけ違う（クーポンの適用条件が変わった等）。
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        changed = make_state(total=5500)
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID, now=NOW, load_current=loader(changed)
            )
        assert exc.value.code == "total_changed"

    def test_coupon_invalidated_rejected_even_when_total_is_unchanged(self):
        # 割引額が 0 のクーポンが有効→無効に変わると合計は動かない。合計だけ見ていると
        # ここを素通しし、place_order が失効したコードを create_order に渡して、下見を
        # やり直す案内の無い生の 400 になる。
        token = confirm.issue(
            KEY, user_id=USER_ID, state=make_state(coupon="ZERO", total=6000), now=NOW
        )
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY,
                token,
                user_id=USER_ID,
                now=NOW,
                # _quote は無効なクーポンを焼かないので coupon_code は None になる。
                load_current=loader(make_state(coupon=None, total=6000)),
            )
        assert exc.value.code == "coupon_changed"

    def test_same_coupon_still_applied_passes(self):
        # 上のチェックが正常系を巻き込んでいないこと。
        state = make_state(coupon="WELCOME10", total=6000)
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        claims = confirm.verify(
            KEY, token, user_id=USER_ID, now=NOW, load_current=loader(state)
        )
        assert claims.state.coupon_code == "WELCOME10"

    def test_address_changed_rejected(self):
        state = make_state(address=confirm.AddressRef(address_id=3))
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        changed = confirm.CartState(
            cart_hash=state.cart_hash,
            address=state.address,
            address_hash=confirm.address_fingerprint("別の住所へ書き換えられた"),
            coupon_code=state.coupon_code,
            total_amount=state.total_amount,
            last_order_id=state.last_order_id,
        )
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID, now=NOW, load_current=loader(changed)
            )
        assert exc.value.code == "address_changed"

    def test_already_ordered_rejected(self):
        # 注文が 1 本でも確定すれば last_order_id が進み、未使用のトークンは全部死ぬ。
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY,
                token,
                user_id=USER_ID,
                now=NOW,
                load_current=loader(make_state(last_order_id=42)),
            )
        assert exc.value.code == "already_ordered"

    @pytest.mark.parametrize(
        "token",
        [
            "",
            "hbc1_",
            "eyJhbGciOiJIUzI1NiJ9.e30.sig",  # JWT を渡してくる経路
            "hbc1_bm90LWJhc2U2NA",  # '.' が無い
            "hbc1_!!!!.!!!!",  # base64 として壊れている
            "hbc1_" + "/w==" + "." + "/w==",  # 非 UTF-8 のバイト列
        ],
    )
    def test_malformed_rejected(self, token):
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, token, user_id=USER_ID, now=NOW, load_current=loader(make_state())
            )
        assert exc.value.code in ("malformed", "bad_signature")

    def test_longest_allowed_free_text_address_round_trips(self):
        # 自由入力の住所は preview_checkout 側で 200 文字に制限してある。その上限いっぱい
        # （和文＋絵文字で最悪のバイト数）でも検証を通ること。通らないと、住所の長い注文
        # だけ issue() は成功して verify() が形式不正で弾く、という壊れ方をする。
        state = make_state(address_text="あ" * 100 + "🏠" * 100, coupon="ク" * 64)
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        assert len(token) <= confirm._MAX_TOKEN_CHARS
        claims = confirm.verify(
            KEY, token, user_id=USER_ID, now=NOW, load_current=loader(state)
        )
        assert claims.state.address.text == state.address.text
        assert claims.state.coupon_code == state.coupon_code

    def test_oversized_token_rejected(self):
        # 壊れた入力に base64 デコードの時間を使わない足切り。
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY,
                "hbc1_" + "A" * 4096,
                user_id=USER_ID,
                now=NOW,
                load_current=loader(make_state()),
            )
        assert exc.value.code == "malformed"


def sign(body: str) -> str:
    """正準文字列を自分で組んで署名する（フィールド構成の検査用）。"""
    mac = hmac.new(KEY, body.encode("utf-8"), hashlib.sha256).digest()
    return f"hbc1_{confirm._b64e(body.encode())}.{confirm._b64e(mac)}"


class TestCanonicalFields:
    """署名は通るがフィールド構成が壊れているトークン（＝こちらのバグか改竄）。"""

    def base_body(self) -> str:
        state = make_state()
        return confirm._canonical(USER_ID, state, NOW, NOW + confirm.TTL_SECONDS, "ab" * 16)

    def test_missing_field_rejected(self):
        body = "|".join(self.base_body().split("|")[:-1])
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, sign(body), user_id=USER_ID, now=NOW, load_current=loader(make_state())
            )
        assert exc.value.code == "malformed"

    def test_duplicate_field_rejected(self):
        body = self.base_body() + "|u=1"
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, sign(body), user_id=USER_ID, now=NOW, load_current=loader(make_state())
            )
        assert exc.value.code == "malformed"

    def test_address_id_and_text_both_set_rejected(self):
        state = make_state(address=confirm.AddressRef(address_id=3))
        body = confirm._canonical(USER_ID, state, NOW, NOW + 60, "cd" * 16).replace(
            "|s=-|", f"|s={confirm._b64e('自由入力'.encode())}|"
        )
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, sign(body), user_id=USER_ID, now=NOW, load_current=loader(state)
            )
        assert exc.value.code == "malformed"

    def test_address_id_zero_without_text_rejected(self):
        state = make_state()
        body = confirm._canonical(USER_ID, state, NOW, NOW + 60, "ef" * 16)
        stripped = "|".join(
            "s=-" if part.startswith("s=") else part for part in body.split("|")
        )
        with pytest.raises(confirm.ConfirmTokenError) as exc:
            confirm.verify(
                KEY, sign(stripped), user_id=USER_ID, now=NOW, load_current=loader(state)
            )
        assert exc.value.code == "malformed"


class TestLoadCurrentContract:
    def test_load_current_receives_claims_address(self):
        # 現在値を組むときの住所は「トークンに焼かれた住所」でなければならない。
        # 呼び出し側の引数を使うと、送り先のすり替えが照合をすり抜ける。
        state = make_state(address=confirm.AddressRef(address_id=5))
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        load = loader(state)
        confirm.verify(KEY, token, user_id=USER_ID, now=NOW, load_current=load)
        assert load.calls[0][0] == confirm.AddressRef(address_id=5, text=None)

    def test_load_current_receives_claims_coupon(self):
        state = make_state(coupon="WELCOME10")
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        load = loader(state)
        confirm.verify(KEY, token, user_id=USER_ID, now=NOW, load_current=load)
        assert load.calls[0][1] == "WELCOME10"

    def test_load_current_not_called_when_signature_bad(self):
        # 署名不正のトークンで DB を触りに行かない（安いチェックを先に置く）。
        state = make_state()
        token = confirm.issue(
            confirm.signing_key("q" * 40), user_id=USER_ID, state=state, now=NOW
        )
        load = loader(state)
        with pytest.raises(confirm.ConfirmTokenError):
            confirm.verify(KEY, token, user_id=USER_ID, now=NOW, load_current=load)
        assert load.calls == []

    def test_load_current_not_called_when_expired(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        load = loader(state)
        with pytest.raises(confirm.ConfirmTokenError):
            confirm.verify(
                KEY,
                token,
                user_id=USER_ID,
                now=NOW + confirm.TTL_SECONDS + 1,
                load_current=load,
            )
        assert load.calls == []


class TestErrorMessages:
    def messages_for(self, **kwargs) -> str:
        try:
            confirm.verify(KEY, **kwargs)
        except confirm.ConfirmTokenError as exc:
            return exc.message
        raise AssertionError("例外が出ていない")

    def test_forgery_variants_share_one_message(self):
        # 署名不正・持ち主違い・形式不正が同じ文面であること（偽造の当たり判定を渡さない）。
        state = make_state()
        good = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        wrong_key = confirm.issue(
            confirm.signing_key("q" * 40), user_id=USER_ID, state=state, now=NOW
        )
        messages = {
            self.messages_for(
                token=wrong_key, user_id=USER_ID, now=NOW, load_current=loader(state)
            ),
            self.messages_for(
                token=good, user_id=USER_ID + 1, now=NOW, load_current=loader(state)
            ),
            self.messages_for(
                token="hbc1_zzz", user_id=USER_ID, now=NOW, load_current=loader(state)
            ),
        }
        assert len(messages) == 1

    def test_expired_message_tells_to_redo_preview(self):
        state = make_state()
        token = confirm.issue(KEY, user_id=USER_ID, state=state, now=NOW)
        message = self.messages_for(
            token=token,
            user_id=USER_ID,
            now=NOW + confirm.TTL_SECONDS + 1,
            load_current=loader(state),
        )
        assert "preview_checkout" in message

    def test_already_ordered_message_mentions_list_orders(self):
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        message = self.messages_for(
            token=token,
            user_id=USER_ID,
            now=NOW,
            load_current=loader(make_state(last_order_id=99)),
        )
        assert "list_orders" in message

    def test_cart_changed_message_mentions_get_cart(self):
        token = confirm.issue(KEY, user_id=USER_ID, state=make_state(), now=NOW)
        message = self.messages_for(
            token=token,
            user_id=USER_ID,
            now=NOW,
            load_current=loader(make_state(lines=((1, 10, 5, 3000),))),
        )
        assert "get_cart" in message

    def test_no_message_leaks_internal_terms(self):
        # 文面はそのまま LLM 経由でユーザーに読まれる。実装の語彙を出さない。
        for message in (
            confirm._MSG_MALFORMED,
            confirm._MSG_EXPIRED,
            confirm._MSG_ALREADY_ORDERED,
            confirm._MSG_CART_CHANGED,
            confirm._MSG_TOTAL_CHANGED,
            confirm._MSG_ADDRESS_CHANGED,
        ):
            lowered = message.lower()
            assert "hmac" not in lowered
            assert "sha256" not in lowered
            assert "signature" not in lowered
            assert "署名" not in message
