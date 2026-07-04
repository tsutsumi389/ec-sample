export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="読み込み中"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 ${className}`}
    />
  );
}
