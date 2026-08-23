# CLAUDE.md — `backend/alembic/`

マイグレーションの運用規律。ここは `backend/alembic/` 配下を触るときにだけ読み込まれる。モデル（`app/models.py`）を変えたときもここを読むこと。

- **スキーマ変更は Alembic のリビジョンで行う**: テーブルは `backend/alembic/versions/` のリビジョンが作る。`Base.metadata.create_all` は使わない（`models.py` を直接 DDL に変換すると、DB に何が適用済みかを誰も知らない状態になる）。バックエンド起動時に `alembic upgrade head` が自動で走る（`backend/app/main.py` の lifespan）ので、`make up-d` するだけで DB は最新になる。
- **モデルを変えたら必ずリビジョンを1本足す**: `make migrate-new m="..."` で現在の DB との差分から生成し、**中身を必ず目視で直す**。autogenerate は「テーブル・カラム・インデックスの増減」しか見ておらず、既存行の埋め方（`server_default` を付けずに NOT NULL 列を足す等）やデータ移行は書いてくれない。既存データが入った DB で落ちるのはここ。
- **生成したリビジョンは置いた瞬間に適用される**: backend は `--reload` で動いているため、`alembic/versions/` にファイルが増えるとアプリが再起動し、autogenerate の下書きのまま `upgrade head` が走る。手直しは **`make migrate-down` で戻してから**行い、直したら `make migrate` で流し直すこと（編集後に downgrade すると、適用時とは別のコードで巻き戻すことになり整合しない）。同じ理由でリビジョンを取り消したいときもファイルを消すだけでは駄目で、`alembic_version` が存在しないリビジョンを指したまま残り `alembic` コマンドが軒並み落ちる（復旧は `alembic stamp --purge <戻したい版>`）。
- **適用済みのリビジョンは書き換えない**: 一度でも共有された（= 誰かの DB に適用された）リビジョンを編集しても、その DB には二度と流れない。訂正は必ず新しいリビジョンで行う。同じ理由でリビジョンから `app.models` を import しないこと（リビジョンは「その時点のスキーマ」の凍結写しであり、モデルを参照すると過去のリビジョンが将来のモデル変更で壊れる）。
- **`0001` と `0002` を分けてあるのは pgvector のため**: `0002` は `CREATE EXTENSION vector` と `product_embeddings` だけを持つ。pgvector が無い DB では `0002` だけが失敗し、`0001` までは適用済みのままアプリが起動できる（レコメンドはフォールバック動作）。この分離は `alembic/env.py` の `transaction_per_migration=True` が前提で、これを外すと `0002` の失敗で `0001` ごと巻き戻りアプリが起動しなくなる。
- **Alembic 導入前に作られた DB は自動で stamp される**: `alembic_version` が無く `users` がある DB は、起動時に `0001`（`product_embeddings` があれば `0002`）として記録される（`main.py` の `_stamp_legacy_schema`）。`make reset` は不要。
- **仕様のデモデータは「新規 DB はシード / 既存 DB はリビジョン」**: `0003` がテーブルを作り、`0004` が **SKU を手がかりに既存の商品行へ仕様を流し込む**（`make reset` は要らない）。新しい DB では商品がまだ無い状態で `0004` が走る（マイグレーション → シードの順）ので何も入らず、直後の `seed_data()` が `seed.py` の `PRODUCT_SPECS` で仕様つきの商品を作る。二重には入らない。`0004` の `SPECS_BY_SKU` は **seed.py からの凍結した写し**であり、`app.seed` を import しないこと（過去のリビジョンの挙動が将来のシード変更で変わってはならない。`app.models` を import しないのと同じ理由）。以後シードの仕様を直しても `0004` は追随しない——それが正しい。

## 検証

`docker compose exec backend alembic check` が「No new upgrade operations detected.」を返すこと。返さない場合はモデルに追随するリビジョンが未作成。
