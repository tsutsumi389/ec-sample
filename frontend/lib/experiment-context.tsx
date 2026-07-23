'use client';

/**
 * A/Bテストの割り当てをアプリ全体に配る。
 *
 * 割り当ては起動時に 1 回だけ取得し、localStorage にキャッシュして再訪問時のちらつきを
 * 抑える。曝露（この人にこの枝を見せた、という記録）はここでは行わず、実験対象のUIが
 * 実際に描画された時点で useVariant().trackExposure() を呼んで記録する。ページを開いた
 * だけで画面下部の実験まで曝露扱いにすると、分母が膨らんで効果が薄まって見えるため。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth-context';
import { getVisitorId } from './visitor';

export interface ExperimentAssignment {
  experiment_key: string;
  variant_key: string;
  config: Record<string, unknown> | null;
}

const CACHE_KEY = 'hibino:experiment-assignments';

interface CachedAssignments {
  visitorId: string;
  assignments: ExperimentAssignment[];
}

function readCache(): ExperimentAssignment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedAssignments;
    // 端末IDが変わっていたらキャッシュは別人のもの。捨てる。
    if (!parsed || parsed.visitorId !== getVisitorId()) return [];
    return Array.isArray(parsed.assignments) ? parsed.assignments : [];
  } catch {
    return [];
  }
}

function writeCache(assignments: ExperimentAssignment[]): void {
  if (typeof window === 'undefined') return;
  const visitorId = getVisitorId();
  if (!visitorId) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ visitorId, assignments }));
  } catch {
    // 保存できなくても毎回サーバーから取得できるので機能自体は動く。
  }
}

interface ExperimentContextValue {
  assignments: Record<string, ExperimentAssignment>;
  /** サーバー確認済み、またはキャッシュを適用済みで、枝を信じてよい状態か。 */
  isReady: boolean;
}

const ExperimentContext = createContext<ExperimentContextValue | undefined>(undefined);

export function ExperimentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ExperimentAssignment[]>([]);
  const [isReady, setIsReady] = useState(false);

  // キャッシュの適用は初期 state ではなくマウント後に行う。useState の初期値で
  // localStorage を読むとサーバー描画結果と食い違い、hydration エラーになるため。
  useEffect(() => {
    const cached = readCache();
    if (cached.length > 0) {
      setAssignments(cached);
      setIsReady(true);
    }
  }, []);

  // ログイン状態が変わったら取り直す。割り当て自体は端末IDで決まるので変わらないが、
  // サーバー側で曝露レコードに user_id を紐付け直せるようにするため。
  useEffect(() => {
    let cancelled = false;
    api
      .get<ExperimentAssignment[]>('/experiments/assignments')
      .then((next) => {
        if (cancelled) return;
        setAssignments(next);
        writeCache(next);
      })
      .catch(() => {
        // 取得に失敗しても既定のUIが出るだけ。画面は壊さない。
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const value = useMemo<ExperimentContextValue>(() => {
    const byKey: Record<string, ExperimentAssignment> = {};
    for (const assignment of assignments) {
      byKey[assignment.experiment_key] = assignment;
    }
    return { assignments: byKey, isReady };
  }, [assignments, isReady]);

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}

// 曝露を送った実験。同じ実験を何度も送らないための抑止（サーバー側も冪等だが無駄を省く）。
const exposedExperiments = new Set<string>();

export interface VariantResult<TConfig> {
  /** 割り当てられた枝のキー。実験対象外・未取得なら null。 */
  variant: string | null;
  /** 枝の設定値。レイアウトや文言はここから読む。 */
  config: TConfig | null;
  /** 割り当てが確定しているか。false の間は既定のUIを出す。 */
  isReady: boolean;
  /** この枝を実際に見せたことを記録する。実験対象のUIを描画した時点で呼ぶ。 */
  trackExposure: () => void;
}

export interface UseVariantOptions {
  /**
   * マウント時に自動で曝露を記録する。コンポーネントの描画がそのまま「見せた」を
   * 意味する場合（セクションの並び替えなど）に使う。折りたたみの中身のように
   * 描画されても見えない場合は false のままにして、見えた時点で自分で呼ぶこと。
   */
  trackOnMount?: boolean;
}

/**
 * 実験の枝を参照する。
 *
 * 実験が配信中でない・この訪問者が対象外・まだ取得前、のいずれでも variant は null に
 * なるので、呼び出し側は「null なら既定のUI」と一様に書ける。
 */
export function useVariant<TConfig = Record<string, unknown>>(
  experimentKey: string,
  options: UseVariantOptions = {}
): VariantResult<TConfig> {
  const context = useContext(ExperimentContext);
  if (!context) {
    throw new Error('useVariant must be used within an ExperimentProvider');
  }
  const assignment = context.assignments[experimentKey] ?? null;
  const variant = assignment?.variant_key ?? null;

  const trackExposure = useCallback(() => {
    if (!variant || exposedExperiments.has(experimentKey)) return;
    exposedExperiments.add(experimentKey);
    // どの枝を見せたかはサーバー側で解決し直すため、ここでは実験キーだけ送る。
    api.post('/experiments/exposure', { experiment_key: experimentKey }).catch(() => {
      // 記録に失敗した場合は次回の機会に任せる（画面は止めない）。
      exposedExperiments.delete(experimentKey);
    });
  }, [experimentKey, variant]);

  const shouldTrackOnMount = options.trackOnMount ?? false;
  // trackExposure は variant 確定で作り直されるため、effect の依存に入れると
  // 二重送信の判断が分かりにくくなる。送信済み判定は Set 側に任せる。
  const exposureRef = useRef(trackExposure);
  exposureRef.current = trackExposure;

  useEffect(() => {
    if (!shouldTrackOnMount || !variant) return;
    exposureRef.current();
  }, [shouldTrackOnMount, variant]);

  return {
    variant,
    config: (assignment?.config as TConfig | null) ?? null,
    isReady: context.isReady,
    trackExposure,
  };
}
