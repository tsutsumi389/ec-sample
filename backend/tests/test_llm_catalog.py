"""llm_catalog の SID 正規化・照合ロジックのユニットテスト（DB 不要）。"""

from types import SimpleNamespace

from app.services import llm_catalog


def _item(sid, reason=""):
    """match_products が受け取る sid/reason を持つ要素の代用。"""
    return SimpleNamespace(sid=sid, reason=reason)


def _product(pid):
    """id だけ参照される Product の代用。"""
    return SimpleNamespace(id=pid)


class TestNormalizeSid:
    def test_plain_sid_unchanged(self):
        assert llm_catalog.normalize_sid("4-0-2") == "4-0-2"

    def test_strips_sid_prefix(self):
        assert llm_catalog.normalize_sid("SID 4-0-2") == "4-0-2"

    def test_prefix_case_insensitive(self):
        assert llm_catalog.normalize_sid("sid 4-0-2") == "4-0-2"

    def test_strips_surrounding_whitespace(self):
        assert llm_catalog.normalize_sid("  4-0-2  ") == "4-0-2"

    def test_empty_and_none(self):
        assert llm_catalog.normalize_sid("") == ""
        assert llm_catalog.normalize_sid(None) == ""


class TestMatchProducts:
    def test_adopts_known_sids_in_order(self):
        p1, p2 = _product(1), _product(2)
        sid_map = {"a": p1, "b": p2}
        items = [_item("a", "理由1"), _item("b", "理由2")]
        adopted = llm_catalog.match_products(items, sid_map, max_items=4)
        assert [(p.id, r) for p, r in adopted] == [(1, "理由1"), (2, "理由2")]

    def test_drops_unknown_sid(self):
        p1 = _product(1)
        sid_map = {"a": p1}
        items = [_item("zzz", "x"), _item("a", "ok")]
        adopted = llm_catalog.match_products(items, sid_map, max_items=4)
        assert [p.id for p, _ in adopted] == [1]

    def test_matches_with_sid_prefix(self):
        p1 = _product(1)
        sid_map = {"4-0-2": p1}
        items = [_item("SID 4-0-2", "r")]
        adopted = llm_catalog.match_products(items, sid_map, max_items=4)
        assert [p.id for p, _ in adopted] == [1]

    def test_dedup_same_product(self):
        p1 = _product(1)
        sid_map = {"a": p1, "SID a": p1}
        items = [_item("a", "first"), _item("a", "dup")]
        adopted = llm_catalog.match_products(items, sid_map, max_items=4)
        assert [(p.id, r) for p, r in adopted] == [(1, "first")]

    def test_respects_max_items(self):
        products = {str(i): _product(i) for i in range(10)}
        items = [_item(str(i), "r") for i in range(10)]
        adopted = llm_catalog.match_products(items, products, max_items=3)
        assert len(adopted) == 3

    def test_reason_truncated_and_empty_becomes_none(self):
        p1, p2 = _product(1), _product(2)
        sid_map = {"a": p1, "b": p2}
        items = [_item("a", "x" * 500), _item("b", "   ")]
        adopted = llm_catalog.match_products(
            items, sid_map, max_items=4, reason_max_len=10
        )
        assert adopted[0][1] == "x" * 10
        assert adopted[1][1] is None

    def test_empty_items(self):
        assert llm_catalog.match_products([], {"a": _product(1)}, max_items=4) == []

    def test_none_sid_is_skipped(self):
        p1 = _product(1)
        adopted = llm_catalog.match_products(
            [_item(None, "r")], {"a": p1}, max_items=4
        )
        assert adopted == []
