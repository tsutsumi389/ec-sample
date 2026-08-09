'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import Badge from '@/components/Badge';
import AdminList, { AdminListHeader, adminRowClass } from '@/components/admin/AdminList';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<User[]>('/admin/users')
      .then(setUsers)
      .catch(() => setError('ユーザー一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <AdminListHeader title="ユーザー管理" />

      <AdminList
        loading={loading}
        error={error}
        isEmpty={users.length === 0}
        emptyText="登録されたユーザーがいません。"
        minWidth={640}
        head={
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">ID</th>
            <th className="px-4 py-3 whitespace-nowrap">名前</th>
            <th className="px-4 py-3 whitespace-nowrap">メールアドレス</th>
            <th className="px-4 py-3 whitespace-nowrap">権限</th>
          </tr>
        }
      >
        {users.map((u) => (
          <tr key={u.id} className={adminRowClass}>
            <td className="px-4 py-3 whitespace-nowrap">{u.id}</td>
            <td className="px-4 py-3 font-medium whitespace-nowrap">{u.name}</td>
            <td className="px-4 py-3 whitespace-nowrap">{u.email}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              <Badge variant={u.role === 'admin' ? 'brand' : 'neutral'}>
                {u.role === 'admin' ? '管理者' : '一般'}
              </Badge>
            </td>
          </tr>
        ))}
      </AdminList>
    </div>
  );
}
