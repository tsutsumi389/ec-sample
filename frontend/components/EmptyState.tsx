import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * データが無いときの空状態表示。中央寄せで、アイコン・見出し・説明・アクションを縦に並べる。
 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      {icon && (
        <div className="text-gray-300 [&>svg]:h-12 [&>svg]:w-12" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={`text-base font-medium text-gray-900 ${icon ? 'mt-4' : ''}`}>{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500 max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
