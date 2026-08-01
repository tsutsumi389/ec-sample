import type { SyntheticEvent } from 'react';

/** 画像が無い／読めないときに差し替えるプレースホルダ。 */
export const NO_IMAGE_SRC = '/no-image.svg';

/**
 * 商品画像の読み込み失敗をプレースホルダで受ける。**すべての <img> の onError をここに通すこと。**
 *
 * `img.onerror = null` と「既にプレースホルダなら何もしない」の二重のガードが要る。
 * 片方でも欠けると、プレースホルダ自体が 404 のときに onError が無限に再発火する。
 * 以前はこの3行が7箇所にインラインで写されていて、パスを変えるだけで
 * 直し漏れがそのまま無限ループになる状態だった。
 */
export function onImageError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.src.endsWith(NO_IMAGE_SRC)) return;
  img.onerror = null;
  img.src = NO_IMAGE_SRC;
}
