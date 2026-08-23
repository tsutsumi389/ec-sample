/**
 * 最新の値を、再登録されない購読やクロージャの中から読むための写し。
 *
 * **これが要るのは、ホストの購読（toolinput / toolresult / toolcancelled）が
 * マウント時に一度だけ登録され、以後差し替えられないため。** 登録時のクロージャは
 * 初期状態を閉じ込めているので、ハンドラから `state` を直接読むと「1回目の検索の
 * 並び順」を永久に使い続ける。ref を1つ挟んで、常に最新を指させる。
 *
 * **書き込みを effect に置くのは、描画中に ref を書き換えないため。** React は次の
 * discrete イベントを処理する前に passive effect を流すので、クリックやセレクト操作
 * から読む値が古いことは無い。
 */

import { useEffect, useRef, type MutableRefObject } from "react";

export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
